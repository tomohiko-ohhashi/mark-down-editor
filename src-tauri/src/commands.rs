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
