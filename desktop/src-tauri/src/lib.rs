// Guidon Desktop's Tauri entry point. Behavior is split across:
// - store.rs: server-URL validation, on-disk persistence, and the Tauri
//   commands (get_server_url/save_server_url) the Settings window calls.
// - windows.rs: window lifecycle - creating the main window at the
//   persisted server URL, and showing/creating the Settings window.
// - menu.rs: the native application menu and its event handling.
// - tray.rs: the system tray icon, its Show/Hide Guidon + Quit menu, and
//   click-to-toggle behavior. Close-to-tray itself (intercepting the main
//   window's X button) is window behavior, not tray behavior, so it lives
//   in windows.rs's create_main_window alongside the rest of the main
//   window's lifecycle.
//
// The main window shows untrusted remote content and is granted ZERO Tauri
// API access; the Settings window built by windows.rs is local, bundled
// content and the only window with API access - see capabilities/*.json.
// Before registering a new plugin or command here, check whether doing so
// would give the main window something new to reach for;
// tauri-plugin-opener (scaffolded by default, removed in an earlier commit)
// is exactly that kind of trap.
mod menu;
mod store;
mod tray;
mod windows;

use store::{get_server_url, save_server_url};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_server_url, save_server_url])
        .setup(|app| {
            windows::create_main_window(app.handle())?;
            menu::setup(app)?;
            tray::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
