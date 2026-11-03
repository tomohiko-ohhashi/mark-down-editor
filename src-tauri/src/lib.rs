mod commands;

/// Files passed on the command line (e.g. by double-clicking a .md file on
/// Windows/Linux) are handed to the frontend once it asks for them.
pub struct StartupFiles(pub std::sync::Mutex<Vec<String>>);

#[tauri::command]
fn take_startup_files(state: tauri::State<StartupFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

fn is_file_arg(arg: &str) -> bool {
    !arg.starts_with('-') && std::path::Path::new(arg).is_file()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup: Vec<String> = std::env::args()
        .skip(1)
        .filter(|a| is_file_arg(a))
        .collect();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(StartupFiles(std::sync::Mutex::new(startup)))
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::file_mtime,
            take_startup_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS delivers double-clicked files as an "Opened" event instead of argv.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    use tauri::{Emitter, Manager};
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.emit("open-files", paths);
                    } else {
                        app.state::<StartupFiles>().0.lock().unwrap().extend(paths);
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
            }
        });
}
