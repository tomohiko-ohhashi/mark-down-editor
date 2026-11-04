use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub mtime: u64,
}

fn mtime_of(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0))
}

/// Read a UTF-8 text file and return its content and modification time (ms since epoch).
#[tauri::command]
pub fn read_file(path: String) -> Result<FileContent, String> {
    let p = Path::new(&path);
    let bytes = fs::read(p).map_err(|e| format!("読み込みに失敗しました: {e}"))?;
    let content =
        String::from_utf8(bytes).map_err(|_| "UTF-8 として読み込めないファイルです".to_string())?;
    let mtime = mtime_of(p)?;
    Ok(FileContent { content, mtime })
}

/// Write content to a file atomically (write to a temp file, then rename).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<u64, String> {
    let p = Path::new(&path);
    let tmp = p.with_extension(format!(
        "{}.tmp",
        p.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    fs::write(&tmp, content.as_bytes()).map_err(|e| format!("保存に失敗しました: {e}"))?;
    fs::rename(&tmp, p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("保存に失敗しました: {e}")
    })?;
    mtime_of(p)
}

/// Return the modification time of a file (ms since epoch). Used to detect external changes.
#[tauri::command]
pub fn file_mtime(path: String) -> Result<u64, String> {
    mtime_of(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrip() {
        let dir = std::env::temp_dir().join(format!("mde-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.md");
        let s = path.to_string_lossy().to_string();
        let mtime = write_file(s.clone(), "# hello\n日本語".into()).unwrap();
        let got = read_file(s.clone()).unwrap();
        assert_eq!(got.content, "# hello\n日本語");
        assert_eq!(got.mtime, mtime);
        assert_eq!(file_mtime(s).unwrap(), mtime);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_missing_file_errors() {
        assert!(read_file("/nonexistent/__none__.md".into()).is_err());
    }
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

/// List a directory for the workspace tree: sub-directories and Markdown/text files,
/// sorted with directories first. Hidden entries (dot files) are skipped.
#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = fs::read_dir(&path)
        .map_err(|e| format!("フォルダを読み込めません: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let p = e.path();
            let is_dir = p.is_dir();
            if !is_dir {
                let ext = p.extension()?.to_str()?.to_ascii_lowercase();
                if !TEXT_EXTENSIONS.contains(&ext.as_str()) {
                    return None;
                }
            }
            Some(DirEntry {
                name,
                path: p.to_string_lossy().into_owned(),
                is_dir,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Save pasted/dropped image bytes next to the document (in an `assets` folder)
/// and return the path relative to the document, for use in Markdown.
///
/// The image is sent as the raw request body (not a JSON number array);
/// `doc-path` (percent-encoded) and `ext` come in as headers.
#[tauri::command]
pub fn save_image(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("画像データの形式が不正です".to_string());
        }
    };
    let header = |name: &str| -> Result<String, String> {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_string())
            .ok_or_else(|| format!("ヘッダー {name} がありません"))
    };
    let doc_path = percent_decode(&header("doc-path")?);
    let ext = header("ext")?;
    save_image_to(&doc_path, &bytes, &ext)
}

/// Decode %XX escapes (as produced by JavaScript's encodeURIComponent).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let decoded = (bytes[i] == b'%' && i + 2 < bytes.len())
            .then(|| std::str::from_utf8(&bytes[i + 1..i + 3]).ok())
            .flatten()
            .and_then(|h| u8::from_str_radix(h, 16).ok());
        match decoded {
            Some(v) => {
                out.push(v);
                i += 3;
            }
            None => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn save_image_to(doc_path: &str, bytes: &[u8], ext: &str) -> Result<String, String> {
    let doc = Path::new(doc_path);
    let dir = doc
        .parent()
        .ok_or_else(|| "保存先のフォルダが分かりません".to_string())?;
    let assets = dir.join("assets");
    fs::create_dir_all(&assets).map_err(|e| format!("assets フォルダを作成できません: {e}"))?;

    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    let ext = if ext.is_empty() {
        "png".to_string()
    } else {
        ext
    };
    let stem = doc
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .replace(' ', "_");
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file_name = format!("{stem}-{stamp}.{ext}");
    let target = assets.join(&file_name);
    fs::write(&target, bytes).map_err(|e| format!("画像を保存できません: {e}"))?;
    Ok(format!("assets/{file_name}"))
}

#[cfg(test)]
mod more_tests {
    use super::*;

    #[test]
    fn read_dir_filters_and_sorts() {
        let dir = std::env::temp_dir().join(format!("mde-dir-{}", std::process::id()));
        fs::create_dir_all(dir.join("zeta")).unwrap();
        fs::create_dir_all(dir.join(".hidden")).unwrap();
        fs::write(dir.join("b.md"), "").unwrap();
        fs::write(dir.join("a.txt"), "").unwrap();
        fs::write(dir.join("c.png"), "").unwrap();
        let entries = read_dir(dir.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["zeta", "a.txt", "b.md"]);
        assert!(entries[0].is_dir);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn percent_decode_handles_utf8_and_literals() {
        assert_eq!(
            percent_decode("%2Fhome%2F%E3%83%A1%E3%83%A2.md"),
            "/home/メモ.md"
        );
        assert_eq!(percent_decode("100%.png"), "100%.png");
        assert_eq!(percent_decode("a%2"), "a%2");
    }

    #[test]
    fn save_image_writes_into_assets() {
        let dir = std::env::temp_dir().join(format!("mde-img-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let doc = dir.join("my doc.md");
        let rel = save_image_to(&doc.to_string_lossy(), &[1, 2, 3], "PNG").unwrap();
        assert!(rel.starts_with("assets/my_doc-"));
        assert!(rel.ends_with(".png"));
        assert_eq!(fs::read(dir.join(&rel)).unwrap(), vec![1, 2, 3]);
        fs::remove_dir_all(&dir).unwrap();
    }
}
