//! Tauri commands: thin wrappers over `mde_core` that take absolute paths.

use mde_core::{DirEntry, FileContent, SearchHit};
use std::path::Path;

#[tauri::command]
pub fn read_file(path: String) -> Result<FileContent, String> {
    mde_core::read_file(Path::new(&path))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<u64, String> {
    mde_core::write_file(Path::new(&path), &content)
}

#[tauri::command]
pub fn file_mtime(path: String) -> Result<u64, String> {
    mde_core::mtime_of(Path::new(&path))
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    mde_core::read_dir(Path::new(&path), |p| p.to_string_lossy().into_owned())
}

/// Save pasted/dropped image bytes next to the document. The image is sent as
/// the raw request body; `doc-path` (percent-encoded) and `ext` come as headers.
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
    let doc_path = mde_core::percent_decode(&header("doc-path")?);
    let ext = header("ext")?;
    mde_core::save_image(Path::new(&doc_path), &bytes, &ext)
}

/// Full-text search under a workspace folder (absolute paths).
#[tauri::command]
pub fn search_workspace(root: String, query: String) -> Result<Vec<SearchHit>, String> {
    mde_core::search(Path::new(&root), &query, 500, &|p| {
        p.to_string_lossy().into_owned()
    })
}
