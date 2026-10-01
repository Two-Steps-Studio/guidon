// Guidon Desktop's Tauri entry point. Behavior is split across:
// - store.rs: server-URL validation, on-disk persistence, and the Tauri
//   commands (get_server_url/save_server_url) the Settings window calls.
// - autostart.rs: thin wrappers (get_autostart_enabled/
//   set_autostart_enabled) around the autostart plugin, for the Settings
//   window's "start at login" checkbox.
// - windows.rs: window lifecycle - creating the main window at the
//   persisted server URL, and showing/creating the Settings window.
// - menu.rs: the native application menu and its event handling.
// - tray.rs: the system tray icon, its Show/Hide Guidon + Quit menu, and
//   click-to-toggle behavior. Close-to-tray itself (intercepting the main
//   window's X button) is window behavior, not tray behavior, so it lives
//   in windows.rs's create_main_window alongside the rest of the main
//   window's lifecycle.
// - plugins.rs: the editor plugin installer behind the local "Install
//   Editor Plugins" window - fetches the server's plugin manifest and
//   extracts a plugin into a project folder the user picks.
// - single instance and window size/position memory are plugins wired in
//   run() below.
// - updater.rs: the manual "Check for Updates..." menu item (Task 5) -
//   checks the GitHub Releases manifest configured in tauri.conf.json and
//   reports the result through a native dialog.
//
// The main window shows untrusted remote content and is granted ZERO Tauri
// API access; the Settings window built by windows.rs is local, bundled
// content and the only window with API access - see capabilities/*.json.
// Before registering a new plugin or command here, check whether doing so
// would give the main window something new to reach for;
// tauri-plugin-opener (scaffolded by default, removed in an earlier commit)
// is exactly that kind of trap. `cargo tauri add autostart` (Task 4)
// scaffolded a capabilities/desktop.json granting the plugin to the `main`
// window by default - that file was deleted and the grant moved into
// capabilities/settings.json instead; see that file's description.
// `cargo tauri add updater` (Task 5) scaffolded the same
// capabilities/desktop.json trap again, granting `updater:default` to
// `main` - that file was deleted too, but this time with nothing to move
// elsewhere: the updater (and dialog, added alongside it) plugins are only
// ever called directly from Rust (updater.rs, triggered by the native
// menu), never invoked from a window's JS, so no capability grant is
// needed for either plugin at all. See updater.rs's own comment for why
// that's safe - capabilities/ACL only gate the JS -> Rust `invoke()`
// boundary, not direct Rust-side plugin calls.
//
// A new #[tauri::command] must be registered in TWO places, not just the
// invoke_handler! list below: also in build.rs's AppManifest::commands, or
// its ACL permission identifier (the allow-<name> capability entries this
// file's commands rely on) never gets generated and the command silently
// isn't callable from a capability file that lists it. build.rs's own
// comment explains the same linkage from its side. updater.rs doesn't add
// a command, so build.rs is unchanged by Task 5.
mod autostart;
mod menu;
mod plugins;
mod store;
mod tray;
mod updater;
mod windows;

use autostart::{get_autostart_enabled, set_autostart_enabled};
use plugins::{
    check_plugin_folder, install_plugin, pick_plugin_folder, plugin_catalog, PluginState,
};
use store::{get_server_url, save_server_url};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered (its docs) - a second launch
        // exits right away and this runs in the first one instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_main_window(app);
        }))
        // Size and position only: restoring VISIBLE would bring the main
        // window back hidden if the app was quit from the tray while it was
        // closed-to-tray. Settings and Plugins are small fixed dialogs.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .with_denylist(&["settings", "plugins"])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(PluginState::default())
        .invoke_handler(tauri::generate_handler![
            get_server_url,
            save_server_url,
            get_autostart_enabled,
            set_autostart_enabled,
            plugin_catalog,
            pick_plugin_folder,
            check_plugin_folder,
            install_plugin
        ])
        .setup(|app| {
            windows::create_main_window(app.handle())?;
            menu::setup(app)?;
            tray::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
