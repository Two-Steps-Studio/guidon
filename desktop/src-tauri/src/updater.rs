// Manual "Check for Updates" flow (Task 5 of the desktop plan). Triggered
// only from the native application menu (menu.rs) - never reachable from
// the untrusted `main` window's JS, since that window is granted zero
// Tauri API access (see capabilities/default.json) and doesn't even load
// this app's own bundled JS. Because of that, this module calls the
// updater and dialog plugins' Rust APIs directly (`UpdaterExt`/`DialogExt`)
// instead of exposing a `#[tauri::command]` for the frontend to `invoke()`.
//
// That distinction matters for the capability boundary: capabilities/ACL
// only gate the JS -> Rust `invoke()` bridge (see lib.rs's top comment,
// which makes the same point about app-defined commands), so a direct
// Rust-side plugin call like the one below needs no capability grant at
// all, and none was added to capabilities/*.json for either plugin.
// `cargo tauri add updater` scaffolded a capabilities/desktop.json granting
// the raw `updater:default` permission set to the `main` window by default
// - the same trap `cargo tauri add autostart` hit in Task 4 (see
// autostart.rs / capabilities/settings.json) and `cargo tauri add store`
// presumably would have hit in Task 2. That scaffolded file was deleted
// rather than repurposed, since nothing in this app needs a capability
// entry for updater or dialog at all.
//
// This is a manual, user-triggered check only - no automatic/periodic
// checking, and no silent background install. Installing an update (if one
// is found) additionally requires an explicit "Yes" on the confirmation
// dialog below, so nothing downloads or installs without the user asking
// for it twice (menu item, then dialog).
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

/// Check the configured GitHub Releases manifest (tauri.conf.json's
/// `plugins.updater.endpoints`) for a newer version, and report the result
/// via a native message dialog:
/// - update found -> ask to download and install now (Yes/No)
/// - no update found -> "up to date" info dialog
/// - the check itself failed (e.g. no manifest published yet, network
///   error) -> error dialog naming the failure
///
/// None of these paths panic or crash the app - every `Result` from the
/// plugin is matched, not unwrapped, which is the behavior Task 5 step 4
/// asks to verify: without a published GitHub Release yet, the "no update
/// available" and "fetch error" cases are the expected, exercised outcomes.
pub(crate) fn check_for_updates(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let check_result = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(err) => Err(err),
        };

        match check_result {
            Ok(Some(update)) => {
                let version = update.version.clone();
                let current_version = update.current_version.clone();
                let install_app = app.clone();
                app.dialog()
                    .message(format!(
                        "A new version of Guidon Desktop is available: {version} (you have {current_version}).\n\nDownload and install it now?"
                    ))
                    .title("Update available")
                    .kind(MessageDialogKind::Info)
                    .buttons(MessageDialogButtons::YesNo)
                    .show(move |confirmed| {
                        if !confirmed {
                            return;
                        }
                        tauri::async_runtime::spawn(async move {
                            // On Windows, a successful install exits the process to
                            // launch the installer (see the plugin's own doc comment
                            // on Update::install) - there's nothing left to notify on
                            // success there. macOS/Linux need a manual relaunch,
                            // which this manual-check-only round doesn't wire up; see
                            // desktop/README.md's Auto-update section.
                            if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
                                install_app
                                    .dialog()
                                    .message(format!(
                                        "Failed to download or install the update: {err}"
                                    ))
                                    .title("Update failed")
                                    .kind(MessageDialogKind::Error)
                                    .buttons(MessageDialogButtons::Ok)
                                    .show(|_| {});
                            }
                        });
                    });
            }
            Ok(None) => {
                app.dialog()
                    .message("Guidon Desktop is up to date.")
                    .title("No update available")
                    .kind(MessageDialogKind::Info)
                    .buttons(MessageDialogButtons::Ok)
                    .show(|_| {});
            }
            Err(err) => {
                app.dialog()
                    .message(format!("Could not check for updates: {err}"))
                    .title("Update check failed")
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::Ok)
                    .show(|_| {});
            }
        }
    });
}
