//! HTTP front end for Toucan Markdown Editor.
//!
//! Serves the same web UI as the desktop app (embedded at build time) and
//! exposes file operations over a small JSON API, so the editor can be used
//! from a browser, typically a phone, against files on a home server.
//! All paths are relative to `--root` and may not escape it.

use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Query, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
};
use clap::Parser;
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(RustEmbed)]
#[folder = "../../dist/"]
struct Assets;

#[derive(Parser, Debug)]
#[command(
    name = "markdown-editor-server",
    version,
    about = "Serve the Toucan Markdown Editor UI over HTTP for use from a browser"
)]
struct Args {
    /// Folder whose Markdown files are exposed. Nothing outside it is reachable.
    #[arg(long, default_value = ".")]
    root: PathBuf,
    /// Address to listen on. Use 127.0.0.1 to allow only this machine.
    #[arg(long, default_value = "0.0.0.0")]
    host: String,
    #[arg(long, default_value_t = 36660)]
    port: u16,
    /// Access token. Generated and printed at startup when omitted.
    #[arg(long, env = "MDE_TOKEN")]
    token: Option<String>,
    /// Disable the token check (only for fully trusted networks).
    #[arg(long)]
    no_auth: bool,
    /// Serve the UI from this folder instead of the embedded copy (development).
    #[arg(long)]
    dist: Option<PathBuf>,
}

struct AppState {
    root: PathBuf,
    token: Option<String>,
    dist: Option<PathBuf>,
}

type Shared = Arc<AppState>;

const COOKIE: &str = "mde_token";

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let root = args
        .root
        .canonicalize()
        .unwrap_or_else(|e| fatal(&format!("--root {} を開けません: {e}", args.root.display())));
    if !root.is_dir() {
        fatal(&format!(
            "--root {} はフォルダではありません",
            root.display()
        ));
    }
    let token = if args.no_auth {
        None
    } else {
        // An empty token (MDE_TOKEN= in a service file) is no token: anyone would get in with "".
        let given = args.token.filter(|t| !t.is_empty());
        if let Some(t) = &given
            && !token_is_usable(t)
        {
            fatal(
                "--token に使えない文字が含まれています (半角の英数字と記号のみ。空白 ; , \" \\ は不可)",
            );
        }
        Some(given.unwrap_or_else(random_token))
    };

    let state: Shared = Arc::new(AppState {
        root: root.clone(),
        token: token.clone(),
        dist: args.dist,
    });

    let api = Router::new()
        .route("/config", get(api_config))
        .route("/file", get(api_read_file).put(api_write_file))
        .route("/mtime", get(api_mtime))
        .route("/dir", get(api_read_dir))
        .route("/image", post(api_save_image))
        .route("/raw", get(api_raw))
        .route("/search", get(api_search))
        .route("/mkdir", post(api_mkdir))
        .route("/rename", post(api_rename))
        .route("/delete", post(api_delete))
        .fallback(api_not_found)
        // The default limit for a request body is 2 MB: a long document could be opened but not
        // saved, and most photos could not be inserted.
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            same_origin_only,
        ))
        .layer(middleware::from_fn_with_state(state.clone(), require_auth));

    let app = Router::new()
        .nest("/api", api)
        .fallback(get(serve_ui))
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .unwrap_or_else(|e| fatal(&format!("アドレスが不正です: {e}")));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| fatal(&format!("{addr} で待ち受けできません: {e}")));

    println!("Toucan Markdown Editor server");
    println!("  公開フォルダ: {}", root.display());
    match &token {
        Some(t) => {
            println!(
                "  ブラウザで開く: http://<このマシンのアドレス>:{}/?token={}",
                args.port,
                percent_encode(t)
            );
            println!("  (トークンは初回アクセス時に Cookie に保存されます)");
        }
        None => println!("  認証なし: http://<このマシンのアドレス>:{}/", args.port),
    }
    axum::serve(listener, app).await.unwrap();
}

fn fatal(msg: &str) -> ! {
    eprintln!("error: {msg}");
    std::process::exit(1)
}

fn random_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Largest request body: a document, or an image dropped into one.
const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;

/// A token has to survive a cookie and a URL: visible ASCII without the characters that end a cookie value.
fn token_is_usable(token: &str) -> bool {
    token
        .chars()
        .all(|c| c.is_ascii_graphic() && !matches!(c, ';' | ',' | '"' | '\\'))
}

/// Escape everything but letters, digits and "-._~" for use in a URL.
fn percent_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// ---------- auth ----------

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(|c| c.trim())
        .find_map(|c| c.strip_prefix(&format!("{COOKIE}=")).map(|v| v.to_string()))
}

fn is_authorized(state: &AppState, headers: &HeaderMap) -> bool {
    match &state.token {
        None => true,
        Some(expected) => {
            let bearer = headers
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(|v| v.to_string());
            cookie_token(headers).as_deref() == Some(expected)
                || bearer.as_deref() == Some(expected)
        }
    }
}

async fn require_auth(State(state): State<Shared>, req: Request, next: Next) -> Response {
    if is_authorized(&state, req.headers()) {
        next.run(req).await
    } else {
        api_error(StatusCode::UNAUTHORIZED, "認証が必要です")
    }
}

/// Without a token, nothing stops another web site that is open in the same browser from sending
/// changes here (with a token, its cookie is never sent along with such a request). So in that mode a
/// change that the browser says comes from another site is refused. A reverse proxy may rewrite
/// the Host header, hence the forwarded host is accepted as well.
async fn same_origin_only(State(state): State<Shared>, req: Request, next: Next) -> Response {
    let headers = req.headers();
    let text = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    if state.token.is_none() && req.method() != axum::http::Method::GET {
        let origin_host = text("origin").and_then(|o| o.split_once("://").map(|(_, h)| h));
        let foreign_origin = origin_host
            .is_some_and(|o| Some(o) != text("host") && Some(o) != text("x-forwarded-host"));
        if text("sec-fetch-site") == Some("cross-site") || foreign_origin {
            return api_error(
                StatusCode::FORBIDDEN,
                "ほかのサイトからの操作は受け付けません",
            );
        }
    }
    next.run(req).await
}

async fn api_not_found() -> Response {
    api_error(StatusCode::NOT_FOUND, "そのような操作はありません")
}

// ---------- UI ----------

async fn serve_ui(State(state): State<Shared>, uri: Uri, headers: HeaderMap) -> Response {
    let query: HashMap<String, String> =
        uri.query().map(serde_urlencoded_parse).unwrap_or_default();

    // First visit with ?token=... : store it in a cookie and drop it from the URL.
    if let (Some(expected), Some(given)) = (&state.token, query.get("token"))
        && given == expected
    {
        let cookie =
            format!("{COOKIE}={given}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000");
        let mut res = Redirect::to("/").into_response();
        res.headers_mut()
            .insert(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
        return res;
    }
    if !is_authorized(&state, &headers) {
        return (StatusCode::UNAUTHORIZED, Html(LOGIN_PAGE)).into_response();
    }

    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    match read_asset(&state, path) {
        Some(bytes) => asset_response(path, bytes),
        None => match read_asset(&state, "index.html") {
            Some(bytes) => asset_response("index.html", bytes),
            None => (StatusCode::NOT_FOUND, "UI files not found").into_response(),
        },
    }
}

fn read_asset(state: &AppState, path: &str) -> Option<Vec<u8>> {
    if let Some(dir) = &state.dist {
        let p = mde_core::resolve_within(dir, path).ok()?;
        return std::fs::read(p).ok();
    }
    Assets::get(path).map(|f| f.data.into_owned())
}

fn asset_response(path: &str, bytes: Vec<u8>) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let cache = if path == "index.html" {
        "no-cache"
    } else {
        "public, max-age=31536000, immutable"
    };
    (
        [
            (header::CONTENT_TYPE, mime.as_ref().to_string()),
            (header::CACHE_CONTROL, cache.to_string()),
        ],
        bytes,
    )
        .into_response()
}

const LOGIN_PAGE: &str = r#"<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Toucan Markdown Editor</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f6f7f9;color:#1f2328}
form{background:#fff;padding:24px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);width:min(360px,90vw)}
input{width:100%;box-sizing:border-box;font-size:16px;padding:10px;border:1px solid #d8dee4;border-radius:8px;margin:12px 0}
button{width:100%;font-size:16px;padding:10px;border:none;border-radius:8px;background:#0969da;color:#fff}</style></head>
<body><form method="get" action="/"><h2>Toucan Markdown Editor</h2><p>サーバー起動時に表示されたトークンを入力してください。<br>Enter the token shown when the server was started.</p>
<input name="token" placeholder="token" autocomplete="off" autofocus><button type="submit">開く / Open</button></form></body></html>"#;

fn serde_urlencoded_parse(q: &str) -> HashMap<String, String> {
    q.split('&')
        .filter_map(|kv| {
            let (k, v) = kv.split_once('=')?;
            Some((
                mde_core::percent_decode(k),
                mde_core::percent_decode(&v.replace('+', " ")),
            ))
        })
        .collect()
}

// ---------- API ----------

#[derive(Deserialize)]
struct PathQuery {
    #[serde(default)]
    path: String,
    /// For writes: the encoding to store the text in (UTF-8 when absent).
    #[serde(default)]
    encoding: Option<String>,
}

fn api_error(status: StatusCode, msg: &str) -> Response {
    (status, axum::Json(json!({ "error": msg }))).into_response()
}

fn bad(msg: String) -> Response {
    api_error(StatusCode::BAD_REQUEST, &msg)
}

fn resolve(state: &AppState, rel: &str) -> Result<PathBuf, Box<Response>> {
    mde_core::resolve_within(&state.root, rel)
        .map_err(|e| Box::new(api_error(StatusCode::FORBIDDEN, &e)))
}

/// Root-relative display path with forward slashes.
fn display_path(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .map(|r| {
            let rel = r.to_string_lossy();
            // Only Windows separates folders with "\"; elsewhere it is an ordinary character of a
            // name, and replacing it would point at a different file.
            if cfg!(windows) {
                rel.replace('\\', "/")
            } else {
                rel.into_owned()
            }
        })
        .unwrap_or_else(|_| p.to_string_lossy().into_owned())
}

/// The shared folder itself is not a file or folder that can be written, renamed or filled in.
fn is_root(state: &AppState, p: &Path) -> bool {
    p == state.root
}

async fn api_config(State(state): State<Shared>) -> Response {
    let name = state
        .root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "root".to_string());
    axum::Json(json!({
        "mode": "web",
        "rootName": name,
        "version": env!("CARGO_PKG_VERSION"),
        "auth": state.token.is_some(),
    }))
    .into_response()
}

async fn api_read_file(State(state): State<Shared>, Query(q): Query<PathQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    match mde_core::read_file(&p) {
        Ok(f) => axum::Json(f).into_response(),
        Err(e) => api_error(StatusCode::NOT_FOUND, &e),
    }
}

async fn api_write_file(
    State(state): State<Shared>,
    Query(q): Query<PathQuery>,
    body: String,
) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    if q.path.trim().is_empty() || is_root(&state, &p) {
        return bad("ファイル名が空です".into());
    }
    match mde_core::write_file(&p, &body, q.encoding.as_deref()) {
        Ok(mtime) => axum::Json(json!({ "mtime": mtime })).into_response(),
        Err(e) => bad(e),
    }
}

async fn api_mtime(State(state): State<Shared>, Query(q): Query<PathQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    match mde_core::mtime_of(&p) {
        Ok(mtime) => axum::Json(json!({ "mtime": mtime })).into_response(),
        Err(e) => api_error(StatusCode::NOT_FOUND, &e),
    }
}

async fn api_read_dir(State(state): State<Shared>, Query(q): Query<PathQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    let root = state.root.clone();
    match mde_core::read_dir(&p, |e| display_path(&root, e)) {
        Ok(entries) => axum::Json(entries).into_response(),
        Err(e) => api_error(StatusCode::NOT_FOUND, &e),
    }
}

#[derive(Deserialize)]
struct ImageQuery {
    doc: String,
    #[serde(default = "default_ext")]
    ext: String,
}
fn default_ext() -> String {
    "png".into()
}

async fn api_save_image(
    State(state): State<Shared>,
    Query(q): Query<ImageQuery>,
    body: Bytes,
) -> Response {
    let doc = match resolve(&state, &q.doc) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    // The image goes into "assets" next to the document, so the document has to be a file in the
    // shared folder; for the folder itself, "next to it" would be outside.
    if is_root(&state, &doc) {
        return api_error(StatusCode::FORBIDDEN, "公開フォルダの外は指定できません");
    }
    if body.len() > 50 * 1024 * 1024 {
        return bad("画像が大きすぎます (50MB まで)".into());
    }
    match mde_core::save_image(&doc, &body, &q.ext) {
        Ok(rel) => axum::Json(json!({ "path": rel })).into_response(),
        Err(e) => bad(e),
    }
}

#[derive(Deserialize)]
struct SearchQuery {
    #[serde(default)]
    path: String,
    q: String,
}

async fn api_search(State(state): State<Shared>, Query(q): Query<SearchQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || {
        mde_core::search(&p, &q.q, 500, &|e| display_path(&root, e))
    })
    .await;
    match result {
        Ok(Ok(hits)) => axum::Json(hits).into_response(),
        Ok(Err(e)) => api_error(StatusCode::NOT_FOUND, &e),
        Err(_) => api_error(StatusCode::INTERNAL_SERVER_ERROR, "検索に失敗しました"),
    }
}

async fn api_mkdir(State(state): State<Shared>, Query(q): Query<PathQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    if q.path.trim().is_empty() || is_root(&state, &p) {
        return bad("フォルダ名が空です".into());
    }
    match mde_core::create_dir(&p) {
        Ok(()) => axum::Json(json!({ "ok": true })).into_response(),
        Err(e) => bad(e),
    }
}

#[derive(Deserialize)]
struct RenameQuery {
    from: String,
    to: String,
}

async fn api_rename(State(state): State<Shared>, Query(q): Query<RenameQuery>) -> Response {
    let (from, to) = match (resolve(&state, &q.from), resolve(&state, &q.to)) {
        (Ok(f), Ok(t)) => (f, t),
        (Err(r), _) | (_, Err(r)) => return *r,
    };
    if q.from.trim().is_empty()
        || q.to.trim().is_empty()
        || is_root(&state, &from)
        || is_root(&state, &to)
    {
        return bad("名前が空です".into());
    }
    match mde_core::rename_path(&from, &to) {
        Ok(()) => axum::Json(json!({ "ok": true })).into_response(),
        Err(e) => bad(e),
    }
}

async fn api_delete(State(state): State<Shared>, Query(q): Query<PathQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    if q.path.trim().is_empty() || p == state.root {
        return bad("公開フォルダ自体は削除できません".into());
    }
    match mde_core::delete_path(&p) {
        Ok(()) => axum::Json(json!({ "ok": true })).into_response(),
        Err(e) => bad(e),
    }
}

/// Serve a file inside the root as-is (images referenced from Markdown).
async fn api_raw(State(state): State<Shared>, Query(q): Query<PathQuery>) -> Response {
    let p = match resolve(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return *r,
    };
    match tokio::fs::read(&p).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&p).first_or_octet_stream();
            (
                [
                    (header::CONTENT_TYPE, mime.as_ref().to_string()),
                    // These are files of the user's folder, shown as images. Opened directly as a
                    // page (an .html or .svg file), nothing in them may run with the editor's rights.
                    (header::CONTENT_SECURITY_POLICY, "sandbox".to_string()),
                    (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_string()),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => api_error(StatusCode::NOT_FOUND, "ファイルがありません"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cookie_token_is_extracted() {
        let mut h = HeaderMap::new();
        h.insert(
            header::COOKIE,
            HeaderValue::from_static("a=1; mde_token=abc; b=2"),
        );
        assert_eq!(cookie_token(&h).as_deref(), Some("abc"));
        assert_eq!(cookie_token(&HeaderMap::new()), None);
    }

    #[test]
    fn authorization_checks_cookie_or_bearer() {
        let state = AppState {
            root: PathBuf::from("/"),
            token: Some("t0k".into()),
            dist: None,
        };
        let mut h = HeaderMap::new();
        assert!(!is_authorized(&state, &h));
        h.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer t0k"),
        );
        assert!(is_authorized(&state, &h));
        let open = AppState {
            root: PathBuf::from("/"),
            token: None,
            dist: None,
        };
        assert!(is_authorized(&open, &HeaderMap::new()));
    }

    #[test]
    fn tokens_that_cannot_work_are_refused() {
        assert!(token_is_usable("8f0a-Zz_.~!@"));
        for bad in ["ひみつ", "a b", "ab;cd", "a,b", "a\"b", "a\\b"] {
            assert!(!token_is_usable(bad), "{bad}");
        }
        assert_eq!(percent_encode("a+b%41 c"), "a%2Bb%2541%20c");
    }

    #[test]
    fn query_parsing_decodes() {
        let q = serde_urlencoded_parse("token=abc&path=%E3%83%A1%E3%83%A2.md");
        assert_eq!(q["token"], "abc");
        assert_eq!(q["path"], "メモ.md");
    }

    #[test]
    fn display_path_is_root_relative() {
        assert_eq!(
            display_path(Path::new("/r"), Path::new("/r/a/b.md")),
            "a/b.md"
        );
    }
}
