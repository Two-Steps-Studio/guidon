// Autostart-at-login toggle (Task 4): thin wrapper commands around the
// tauri-plugin-autostart plugin (registered in lib.rs) so the Settings
// window can read and change whether Guidon Desktop launches when Windows
// starts.
//
// These wrap the plugin's own `enable`/`disable`/`is_enabled` commands
// (`app.autolaunch()`, from `tauri_plugin_autostart::ManagerExt`) rather
// than letting the Settings page invoke `plugin:autostart|enable` etc.
// directly, for the same reason store.rs wraps the Store plugin: it keeps
// the capability grant (capabilities/settings.json) expressed in terms of
// this app's own command names, consistent with get_server_url/
// save_server_url, instead of mixing app commands and raw plugin command
// strings in the Settings JS.
//
// The plugin defaults the registered app name to `package_info().name`,
// which resolves to tauri.conf.json's `productName` ("Guidon Desktop") -
// that's the name that shows up in Windows' Task Manager > Startup apps
// list once enabled.
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Whether Guidon Desktop is currently registered to launch at Windows
/// startup - read by the Settings page on load so the checkbox reflects
/// real state instead of defaulting to unchecked.
#[tauri::command]
pub(crate) fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// Enable or disable launching Guidon Desktop at Windows startup.
#[tauri::command]
pub(crate) fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}
