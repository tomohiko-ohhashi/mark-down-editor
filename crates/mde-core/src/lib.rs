//! File-system operations shared by the Tauri desktop app and the web server.
//! Every function takes plain paths and returns plain data so both front ends
//! can expose them over their own transport (IPC or HTTP).

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize, Debug, PartialEq)]
pub struct FileContent {
    pub content: String,
    pub mtime: u64,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

pub fn mtime_of(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0))
}

/// Read a UTF-8 text file and return its content and modification time (ms since epoch).
pub fn read_file(path: &Path) -> Result<FileContent, String> {
    let bytes = fs::read(path).map_err(|e| format!("読み込みに失敗しました: {e}"))?;
    let content =
        String::from_utf8(bytes).map_err(|_| "UTF-8 として読み込めないファイルです".to_string())?;
    let mtime = mtime_of(path)?;
    Ok(FileContent { content, mtime })
}

/// Write content atomically (temp file in the same directory, then rename).
/// Creates missing parent directories.
pub fn write_file(path: &Path, content: &str) -> Result<u64, String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|e| format!("フォルダを作成できません: {e}"))?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    fs::write(&tmp, content.as_bytes()).map_err(|e| format!("保存に失敗しました: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("保存に失敗しました: {e}")
    })?;
    mtime_of(path)
}

/// List a directory for the workspace tree: sub-directories and Markdown/text
/// files, directories first, hidden entries skipped. `display` maps an absolute
/// entry path to the path string handed to the UI (absolute for the desktop
/// app, root-relative for the web server).
pub fn read_dir(path: &Path, display: impl Fn(&Path) -> String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = fs::read_dir(path)
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
                path: display(&p),
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

/// Save image bytes next to the document (in an `assets` folder) and return
/// the path relative to the document, for use in Markdown.
pub fn save_image(doc_path: &Path, bytes: &[u8], ext: &str) -> Result<String, String> {
    let dir = doc_path
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
    let stem = doc_path
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

#[derive(Serialize, Debug, PartialEq)]
pub struct SearchHit {
    pub path: String,
    /// 1-based line number.
    pub line: u32,
    pub text: String,
}

const SEARCH_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const SEARCH_SKIP_DIRS: &[&str] = &["node_modules", "target", "dist"];

/// Case-insensitive substring search over every Markdown/text file under
/// `root` (hidden entries and build folders skipped). Stops after `max` hits.
/// `display` maps an absolute path to the string handed to the UI.
pub fn search(
    root: &Path,
    query: &str,
    max: usize,
    display: &impl Fn(&Path) -> String,
) -> Result<Vec<SearchHit>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) if dir == root => return Err(format!("フォルダを読み込めません: {e}")),
            Err(_) => continue,
        };
        let mut children: Vec<PathBuf> = entries.filter_map(|e| e.ok()).map(|e| e.path()).collect();
        children.sort();
        for p in children {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') {
                continue;
            }
            if p.is_dir() {
                if !SEARCH_SKIP_DIRS.contains(&name) {
                    stack.push(p);
                }
                continue;
            }
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();
            if !TEXT_EXTENSIONS.contains(&ext.as_str()) {
                continue;
            }
            if fs::metadata(&p).map(|m| m.len()).unwrap_or(0) > SEARCH_MAX_FILE_BYTES {
                continue;
            }
            let Ok(content) = fs::read_to_string(&p) else {
                continue;
            };
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    hits.push(SearchHit {
                        path: display(&p),
                        line: (i + 1) as u32,
                        text: line.trim().chars().take(200).collect(),
                    });
                    if hits.len() >= max {
                        return Ok(hits);
                    }
                }
            }
        }
    }
    Ok(hits)
}

/// Resolve a user-supplied relative path against `root`, refusing anything
/// that would escape it ("..", absolute paths, drive prefixes). Returns the
/// absolute path; the target does not have to exist.
pub fn resolve_within(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim_start_matches(['/', '\\']);
    let mut out = root.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("公開フォルダの外は指定できません".to_string());
            }
        }
    }
    Ok(out)
}

/// Decode %XX escapes (as produced by JavaScript's encodeURIComponent).
pub fn percent_decode(s: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("mde-core-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = tmp("rw");
        let path = dir.join("sub").join("a.md");
        let mtime = write_file(&path, "# hello\n日本語").unwrap();
        let got = read_file(&path).unwrap();
        assert_eq!(got.content, "# hello\n日本語");
        assert_eq!(got.mtime, mtime);
        assert_eq!(mtime_of(&path).unwrap(), mtime);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_missing_file_errors() {
        assert!(read_file(Path::new("/nonexistent/__none__.md")).is_err());
    }

    #[test]
    fn read_dir_filters_and_sorts() {
        let dir = tmp("dir");
        fs::create_dir_all(dir.join("zeta")).unwrap();
        fs::create_dir_all(dir.join(".hidden")).unwrap();
        fs::write(dir.join("b.md"), "").unwrap();
        fs::write(dir.join("a.txt"), "").unwrap();
        fs::write(dir.join("c.png"), "").unwrap();
        let entries = read_dir(&dir, |p| p.to_string_lossy().into_owned()).unwrap();
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["zeta", "a.txt", "b.md"]);
        assert!(entries[0].is_dir);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn save_image_writes_into_assets() {
        let dir = tmp("img");
        let doc = dir.join("my doc.md");
        let rel = save_image(&doc, &[1, 2, 3], "PNG").unwrap();
        assert!(rel.starts_with("assets/my_doc-"));
        assert!(rel.ends_with(".png"));
        assert_eq!(fs::read(dir.join(&rel)).unwrap(), vec![1, 2, 3]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn search_finds_lines_case_insensitively() {
        let dir = tmp("search");
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join("a.md"), "# Title\nHello World\n").unwrap();
        fs::write(dir.join("sub/b.txt"), "no match\nhello again\n").unwrap();
        fs::write(dir.join(".git/c.md"), "hello hidden\n").unwrap();
        fs::write(dir.join("d.png"), "hello binary").unwrap();
        let hits = search(&dir, "HELLO", 10, &|p| {
            p.strip_prefix(&dir).unwrap().to_string_lossy().into_owned()
        })
        .unwrap();
        let mut got: Vec<(String, u32)> = hits.iter().map(|h| (h.path.clone(), h.line)).collect();
        got.sort();
        assert_eq!(
            got,
            vec![("a.md".to_string(), 2), ("sub/b.txt".to_string(), 2)]
        );
        assert_eq!(
            search(&dir, "  ", 10, &|p| p.to_string_lossy().into_owned())
                .unwrap()
                .len(),
            0
        );
        assert_eq!(
            search(&dir, "hello", 1, &|p| p.to_string_lossy().into_owned())
                .unwrap()
                .len(),
            1
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn resolve_within_rejects_escapes() {
        let root = Path::new("/srv/notes");
        assert_eq!(resolve_within(root, "a/b.md").unwrap(), root.join("a/b.md"));
        assert_eq!(resolve_within(root, "/a.md").unwrap(), root.join("a.md"));
        assert_eq!(
            resolve_within(root, "./a/./b.md").unwrap(),
            root.join("a/b.md")
        );
        assert!(resolve_within(root, "../etc/passwd").is_err());
        assert!(resolve_within(root, "a/../../x").is_err());
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
}
