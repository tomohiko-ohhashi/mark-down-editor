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
    /// Character encoding the file is stored in ("UTF-8", "Shift_JIS", "EUC-JP", "UTF-16LE" ...).
    /// The content is always handed over as Unicode; saving converts back.
    pub encoding: String,
}

/// Said when the text has characters the file's encoding cannot store; the UI offers UTF-8 then.
pub const CANNOT_ENCODE: &str = "この文字コードでは保存できない文字が含まれています";

/// Name given to UTF-8 files that start with a byte-order mark (Windows tools write these).
/// The mark is not part of the text: it is taken off when reading and put back when saving.
pub const UTF8_BOM: &str = "UTF-8 BOM";

/// Decode the bytes of a text file. UTF-8 is tried first; otherwise the
/// encoding is guessed (older Japanese text is usually Shift_JIS or EUC-JP).
pub fn decode_text(bytes: &[u8]) -> Result<(String, &'static str), String> {
    // A UTF-16 byte-order mark settles it (a UTF-8 one is handled like plain UTF-8 below).
    let bom = encoding_rs::Encoding::for_bom(bytes).filter(|(enc, _)| *enc != encoding_rs::UTF_8);
    if let Some((enc, bom_len)) = bom {
        let (text, had_errors) = enc.decode_without_bom_handling(&bytes[bom_len..]);
        if had_errors {
            return Err("文字コードを判別できないファイルです".to_string());
        }
        return Ok((text.into_owned(), enc.name()));
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(match text.strip_prefix('\u{feff}') {
            Some(rest) => (rest.to_string(), UTF8_BOM),
            None => (text.to_string(), "UTF-8"),
        });
    }
    // Not text at all (an image, an archive ...): a guess would only show garbage.
    if bytes.contains(&0) {
        return Err("文字コードを判別できないファイルです".to_string());
    }
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let enc = detector.guess(Some(b"jp"), true);
    let (text, _, had_errors) = enc.decode(bytes);
    if had_errors {
        return Err("文字コードを判別できないファイルです".to_string());
    }
    Ok((text.into_owned(), enc.name()))
}

/// Encode text for a file stored in `encoding` (as reported by `read_file`).
pub fn encode_text(content: &str, encoding: &str) -> Result<Vec<u8>, String> {
    if encoding == UTF8_BOM {
        return Ok(["\u{feff}".as_bytes(), content.as_bytes()].concat());
    }
    let enc = encoding_rs::Encoding::for_label(encoding.as_bytes()).unwrap_or(encoding_rs::UTF_8);
    if enc == encoding_rs::UTF_8 {
        return Ok(content.as_bytes().to_vec());
    }
    if enc == encoding_rs::UTF_16LE || enc == encoding_rs::UTF_16BE {
        // encoding_rs only decodes UTF-16; write it by hand, with the byte-order mark it was read with.
        let le = enc == encoding_rs::UTF_16LE;
        let mut out: Vec<u8> = if le {
            vec![0xFF, 0xFE]
        } else {
            vec![0xFE, 0xFF]
        };
        for unit in content.encode_utf16() {
            out.extend_from_slice(&if le {
                unit.to_le_bytes()
            } else {
                unit.to_be_bytes()
            });
        }
        return Ok(out);
    }
    let (bytes, _, had_errors) = enc.encode(content);
    // Some characters are stored as a different one without an error (in Shift_JIS, "¥" becomes
    // the byte that reads back as "\"), so also require that the bytes read back as the same text.
    if had_errors || enc.decode_without_bom_handling(&bytes).0 != content {
        return Err(format!("{CANNOT_ENCODE}: {}", enc.name()));
    }
    Ok(bytes.into_owned())
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];
/// Images are listed in the tree too, so they can be looked at and inserted.
pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

pub fn mtime_of(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0))
}

/// Read a text file and return its content, encoding and modification time (ms since epoch).
pub fn read_file(path: &Path) -> Result<FileContent, String> {
    // The time is taken before reading. Taken afterwards, a change made while the file was being
    // read would carry the new time with the old text, and would never be noticed.
    let mtime = mtime_of(path)?;
    let bytes = fs::read(path).map_err(|e| format!("読み込みに失敗しました: {e}"))?;
    let (content, encoding) = decode_text(&bytes)?;
    Ok(FileContent {
        content,
        mtime,
        encoding: encoding.to_string(),
    })
}

/// Write content atomically (temp file in the same directory, then rename).
/// Creates missing parent directories. `encoding` is the one `read_file`
/// reported for the file (UTF-8 when absent or unknown).
///
/// What the file was is kept: a link stays a link (the file it points at is
/// written), the permissions stay, and a read-only file is refused.
pub fn write_file(path: &Path, content: &str, encoding: Option<&str>) -> Result<u64, String> {
    let bytes = encode_text(content, encoding.unwrap_or("UTF-8"))?;
    let fail = |e: std::io::Error| format!("保存に失敗しました: {e}");
    let is_link = fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    let target = if is_link {
        fs::canonicalize(path).map_err(fail)?
    } else {
        path.to_path_buf()
    };
    let existing = fs::metadata(&target).ok();
    if let Some(meta) = &existing {
        if meta.is_dir() {
            return Err("同じ名前のフォルダがあるため保存できません".to_string());
        }
        if meta.permissions().readonly() {
            return Err("読み取り専用のファイルのため保存できません".to_string());
        }
    }
    let dir = match target.parent().filter(|p| !p.as_os_str().is_empty()) {
        Some(parent) => {
            fs::create_dir_all(parent).map_err(|e| format!("フォルダを作成できません: {e}"))?;
            parent.to_path_buf()
        }
        None => PathBuf::from("."),
    };
    let tmp = dir.join(temp_name());
    let permissions = existing.as_ref().map(|m| m.permissions());
    let replaced = write_new(&tmp, &bytes, permissions).and_then(|()| fs::rename(&tmp, &target));
    if let Err(e) = replaced {
        let _ = fs::remove_file(&tmp);
        // The folder takes no new files but the file itself can be written: write into it.
        if existing.is_some() && e.kind() == std::io::ErrorKind::PermissionDenied {
            fs::write(&target, &bytes).map_err(fail)?;
        } else {
            return Err(fail(e));
        }
    }
    mtime_of(&target)
}

/// A name for the temporary file of one save. It does not depend on the file's own name: two saves
/// at the same moment must not share it, a file called "<name>.tmp" must not be hit, and a very
/// long file name must not make it too long. It starts with a dot, so the file tree never lists it.
fn temp_name() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!(
        ".mde-{}-{}-{nanos}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

/// Create `path` (it must not exist) with `bytes`, give it `permissions` and make sure it is on disk.
fn write_new(
    path: &Path,
    bytes: &[u8],
    permissions: Option<fs::Permissions>,
) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(bytes)?;
    if let Some(p) = permissions {
        file.set_permissions(p)?;
    }
    file.sync_all()
}

/// List a directory for the workspace tree: sub-directories, Markdown/text
/// files and images, directories first, hidden entries skipped. `display` maps an absolute
/// entry path to the path string handed to the UI (absolute for the desktop
/// app, root-relative for the web server).
pub fn read_dir(path: &Path, display: impl Fn(&Path) -> String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = fs::read_dir(path)
        .map_err(|e| format!("フォルダを読み込めません: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            // A name that is not valid Unicode cannot be handed to the UI and back; such a file
            // could be listed but never opened.
            let name = e.file_name().to_str()?.to_string();
            if name.starts_with('.') {
                return None;
            }
            let p = e.path();
            let is_dir = p.is_dir();
            if !is_dir {
                let ext = p.extension()?.to_str()?.to_ascii_lowercase();
                if !TEXT_EXTENSIONS.contains(&ext.as_str())
                    && !IMAGE_EXTENSIONS.contains(&ext.as_str())
                {
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
        .filter(|_| doc_path.file_name().is_some())
        .ok_or_else(|| "保存先のフォルダが分かりません".to_string())?;
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    let ext = if ext.is_empty() {
        "png".to_string()
    } else {
        ext
    };
    // The extension becomes part of a file name: letters and digits only (no "/", no "..").
    if ext.len() > 8 || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("画像の種類が不正です".to_string());
    }
    let assets = dir.join("assets");
    fs::create_dir_all(&assets).map_err(|e| format!("assets フォルダを作成できません: {e}"))?;

    let stem = doc_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .replace(' ', "_");
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Several images saved within the same millisecond must not overwrite each other.
    let mut file_name = format!("{stem}-{stamp}.{ext}");
    let mut n = 1;
    while assets.join(&file_name).exists() {
        n += 1;
        file_name = format!("{stem}-{stamp}-{n}.{ext}");
    }
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
            let Ok(content) = fs::read(&p)
                .map_err(|e| e.to_string())
                .and_then(|b| decode_text(&b).map(|(t, _)| t))
            else {
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

/// Create a folder (and missing parents).
pub fn create_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err("同じ名前のフォルダかファイルが既にあります".to_string());
    }
    fs::create_dir_all(path).map_err(|e| format!("フォルダを作成できません: {e}"))
}

/// Rename or move a file / folder. Refuses to overwrite an existing target.
pub fn rename_path(from: &Path, to: &Path) -> Result<(), String> {
    if !from.exists() {
        return Err("元のファイルがありません".to_string());
    }
    if to != from && to.starts_with(from) {
        return Err("フォルダをそのフォルダ自身の中へは移動できません".to_string());
    }
    // Where upper and lower case are the same name (Windows, macOS), "a.md" -> "A.md" finds
    // itself at the new name; that is the same file, not a name that is taken.
    if to.exists() && !only_case_differs(from, to) {
        return Err("同じ名前のフォルダかファイルが既にあります".to_string());
    }
    if let Some(parent) = to.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|e| format!("フォルダを作成できません: {e}"))?;
    }
    fs::rename(from, to).map_err(|e| format!("名前を変更できません: {e}"))
}

/// True when `to` is `from` under a name that differs only in upper / lower case.
fn only_case_differs(from: &Path, to: &Path) -> bool {
    let name = |p: &Path| p.file_name().map(|n| n.to_string_lossy().to_lowercase());
    from != to
        && from.parent() == to.parent()
        && name(from) == name(to)
        && matches!((fs::canonicalize(from), fs::canonicalize(to)), (Ok(a), Ok(b)) if a == b)
}

/// Permanently delete a file or a folder (recursively). Callers confirm first.
pub fn delete_path(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| format!("削除できません: {e}"))?;
    let r = if meta.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    r.map_err(|e| format!("削除できません: {e}"))
}

/// Resolve a user-supplied relative path against `root`, refusing anything
/// that would escape it ("..", absolute paths, drive prefixes). Returns the
/// absolute path; the target does not have to exist.
pub fn resolve_within(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim_start_matches(['/', '\\']);
    let mut out = root.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            // On Windows "D:" in the middle of a path would replace everything before it.
            Component::Normal(seg) if cfg!(windows) && seg.to_string_lossy().contains(':') => {
                return Err("公開フォルダの外は指定できません".to_string());
            }
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
        let mtime = write_file(&path, "# hello\n日本語", None).unwrap();
        let got = read_file(&path).unwrap();
        assert_eq!(got.content, "# hello\n日本語");
        assert_eq!(got.mtime, mtime);
        assert_eq!(mtime_of(&path).unwrap(), mtime);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn saving_leaves_no_temporary_file_and_no_neighbour_is_touched() {
        let dir = tmp("save-clean");
        let path = dir.join("note.md");
        fs::write(dir.join("note.md.tmp"), "the user's own file").unwrap();
        write_file(&path, "one", None).unwrap();
        write_file(&path, "two", None).unwrap();
        // A character that Shift_JIS cannot hold: the save fails and the file stays as it was.
        assert!(write_file(&path, "😀", Some("Shift_JIS")).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "two");
        let mut names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["note.md", "note.md.tmp"]);
        assert_eq!(
            fs::read_to_string(dir.join("note.md.tmp")).unwrap(),
            "the user's own file"
        );
        // A folder is not a file to save into (and nothing next to it is touched).
        assert!(write_file(&dir, "x", None).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn saving_a_file_with_a_very_long_name_works() {
        let dir = tmp("save-long");
        let path = dir.join(format!("{}.md", "あ".repeat(84)));
        write_file(&path, "text", None).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "text");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn saving_keeps_permissions_and_links_and_refuses_read_only_files() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tmp("save-meta");
        let private = dir.join("private.md");
        fs::write(&private, "old").unwrap();
        fs::set_permissions(&private, fs::Permissions::from_mode(0o600)).unwrap();
        write_file(&private, "new", None).unwrap();
        assert_eq!(
            fs::metadata(&private).unwrap().permissions().mode() & 0o777,
            0o600
        );

        // Saving through a link writes the file it points at; the link stays a link.
        let real = dir.join("real.md");
        let link = dir.join("link.md");
        fs::write(&real, "old").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        write_file(&link, "through the link", None).unwrap();
        assert!(
            fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(fs::read_to_string(&real).unwrap(), "through the link");

        let locked = dir.join("locked.md");
        fs::write(&locked, "keep").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o444)).unwrap();
        assert!(write_file(&locked, "changed", None).is_err());
        assert_eq!(fs::read_to_string(&locked).unwrap(), "keep");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_image_can_only_be_saved_next_to_a_document_with_a_plain_extension() {
        let dir = tmp("img-safe");
        let doc = dir.join("doc.md");
        fs::write(&doc, "").unwrap();
        assert!(save_image(&doc, b"x", "png").is_ok());
        for ext in ["/../../escaped.txt", "a/b", "../x", "p ng", "toolongext"] {
            assert!(save_image(&doc, b"x", ext).is_err(), "{ext}");
        }
        assert!(save_image(Path::new("/"), b"x", "png").is_err());
        assert!(!dir.parent().unwrap().join("escaped.txt").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_folder_cannot_be_moved_into_itself() {
        let dir = tmp("mv-self");
        let d = dir.join("d");
        fs::create_dir_all(&d).unwrap();
        assert!(rename_path(&d, &d.join("new").join("inside")).is_err());
        assert!(!d.join("new").exists());
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
        fs::write(dir.join("d.zip"), "").unwrap();
        let entries = read_dir(&dir, |p| p.to_string_lossy().into_owned()).unwrap();
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        // Folders first, then documents and images; other files and hidden folders are left out.
        assert_eq!(names, vec!["zeta", "a.txt", "b.md", "c.png"]);
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
        // Display paths with "/" on every OS, as the server does.
        let rel = |p: &Path| {
            p.strip_prefix(&dir)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/")
        };
        let hits = search(&dir, "HELLO", 10, &rel).unwrap();
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
    fn create_rename_delete() {
        let dir = tmp("crd");
        let d = dir.join("docs");
        create_dir(&d).unwrap();
        assert!(create_dir(&d).is_err());
        let f = d.join("a.md");
        write_file(&f, "x", None).unwrap();
        let g = d.join("b.md");
        rename_path(&f, &g).unwrap();
        assert!(!f.exists() && g.exists());
        assert!(rename_path(&g, &g).is_err());
        assert!(rename_path(&f, &d.join("c.md")).is_err());
        delete_path(&g).unwrap();
        assert!(!g.exists());
        delete_path(&d).unwrap();
        assert!(!d.exists());
        assert!(delete_path(&d).is_err());
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

    #[test]
    fn utf8_bom_and_binary() {
        // The byte-order mark is not part of the text, and saving puts it back.
        let (text, enc) = decode_text(b"\xEF\xBB\xBF# title\n").unwrap();
        assert_eq!((text.as_str(), enc), ("# title\n", UTF8_BOM));
        assert_eq!(
            encode_text("# title\n", enc).unwrap(),
            b"\xEF\xBB\xBF# title\n"
        );
        assert_eq!(
            decode_text(b"# title\n").unwrap(),
            ("# title\n".to_string(), "UTF-8")
        );
        assert_eq!(encode_text("# title\n", "UTF-8").unwrap(), b"# title\n");
        // Binary data is refused rather than shown as garbage.
        assert!(decode_text(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR\xff\xfe").is_err());
    }

    #[test]
    fn shift_jis_round_trip() {
        let dir = std::env::temp_dir().join(format!("mde-sjis-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sjis.txt");
        let text = "# 見出し\r\n日本語のテキスト、ｶﾀｶﾅ、①\r\n";
        let (bytes, _, _) = encoding_rs::SHIFT_JIS.encode(text);
        fs::write(&path, &bytes).unwrap();

        let got = read_file(&path).unwrap();
        assert_eq!(got.encoding, "Shift_JIS");
        assert_eq!(got.content, text);

        // Saving keeps the encoding: the bytes on disk are Shift_JIS again.
        write_file(&path, &format!("{text}追記\r\n"), Some(&got.encoding)).unwrap();
        let on_disk = fs::read(&path).unwrap();
        assert!(std::str::from_utf8(&on_disk).is_err());
        assert_eq!(read_file(&path).unwrap().content, format!("{text}追記\r\n"));

        // A character Shift_JIS cannot store is refused instead of being replaced.
        let err = write_file(&path, "emoji 🦜", Some("Shift_JIS")).unwrap_err();
        assert!(err.starts_with(CANNOT_ENCODE));
        // ... and so is one that would be stored as a different character.
        assert!(encode_text("100¥", "Shift_JIS").is_err());
        assert!(encode_text("100\\ ～", "Shift_JIS").is_ok());
        assert_eq!(read_file(&path).unwrap().content, format!("{text}追記\r\n"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn other_encodings() {
        let (euc, _, _) =
            encoding_rs::EUC_JP.encode("これは日本語の文章です。漢字とひらがなとカタカナ。");
        assert_eq!(decode_text(&euc).unwrap().1, "EUC-JP");

        let utf16 = encode_text("abc 日本語", "UTF-16LE").unwrap();
        assert_eq!(&utf16[..2], &[0xFF, 0xFE]);
        assert_eq!(
            decode_text(&utf16).unwrap(),
            ("abc 日本語".to_string(), "UTF-16LE")
        );

        assert_eq!(decode_text("plain ascii".as_bytes()).unwrap().1, "UTF-8");
        assert_eq!(
            decode_text("\u{feff}with bom".as_bytes()).unwrap(),
            ("with bom".to_string(), UTF8_BOM)
        );
        assert_eq!(encode_text("x", "no-such-encoding").unwrap(), b"x");
    }
}
