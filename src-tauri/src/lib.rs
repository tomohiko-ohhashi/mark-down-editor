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
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(StartupFiles(std::sync::Mutex::new(startup)))
        .setup(|app| {
            // macOS needs an application menu for Edit shortcuts (copy/paste) to work.
            // We build our own without "Close Window" so Cmd+W can close a tab instead.
            #[cfg(target_os = "macos")]
            {
                use tauri::Emitter;
                use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
                // A custom Quit item (instead of the predefined one, which terminates the
                // process directly) so the frontend can ask about unsaved changes first.
                let quit = MenuItemBuilder::with_id("quit", "Quit Markdown Editor")
                    .accelerator("CmdOrCtrl+Q")
                    .build(app)?;
                let app_menu = SubmenuBuilder::new(app, "Markdown Editor")
                    .about(Some(AboutMetadata::default()))
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .item(&quit)
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .maximize()
                    .separator()
                    .fullscreen()
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu])
                    .build()?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        let _ = app.emit("quit-requested", ());
                    }
                });
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = app;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::file_mtime,
            commands::read_dir,
            commands::save_image,
            commands::search_workspace,
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
                    // The window may exist before the frontend has registered its
                    // listener, so always queue the paths for `take_startup_files`
                    // as well as emitting; the frontend de-duplicates by path.
                    app.state::<StartupFiles>()
                        .0
                        .lock()
                        .unwrap()
                        .extend(paths.clone());
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.emit("open-files", paths);
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app, event);
            }
        });
}
