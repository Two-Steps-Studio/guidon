// Window lifecycle: creating the main (untrusted, remote-content) window at
// startup, and showing/creating the local Settings window on demand.
use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::store::stored_server_url;

/// Create the main window, pointed at whatever server URL is currently
/// persisted (Task 2), not a value hardcoded in tauri.conf.json (Task 1) -
/// this is how a self-hosted user points the app at their own server and
/// has it stick across restarts.
///
/// The main window shows untrusted remote content and is granted ZERO
/// Tauri API access - see capabilities/default.json's own comment.
pub(crate) fn create_main_window(app: &AppHandle) -> tauri::Result<()> {
    let main_url = stored_server_url(app);
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(main_url))
        .title("Guidon Desktop")
        .inner_size(800.0, 600.0)
        .build()?;

    // Close-to-tray (Task 3): clicking the window's X button would
    // otherwise quit the whole app (Tauri's default), which defeats the
    // point of having a tray icon (tray.rs) at all. Intercept the close
    // request, prevent it, and hide the window instead - the process keeps
    // running in the tray. Only the tray menu's "Quit" item should call
    // `app.exit()` for a real exit; see tray.rs.
    //
    // `window` is cloned rather than borrowed because `on_window_event`
    // takes `&self` on the same value the closure needs to move `hide()`
    // into - the clone is cheap (it wraps a shared handle, not the OS
    // window itself).
    let window_for_event = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_for_event.hide();
        }
    });

    Ok(())
}

/// Toggle the main window's visibility - used by both the tray icon's own
/// click and its "Show/Hide Guidon" menu item (tray.rs). Hidden rather than
/// destroyed by close-to-tray above, so this is a plain show/hide flip, not
/// a re-create.
pub(crate) fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Show the Settings window, creating it on first use. This is genuinely
/// local, bundled content (served via tauri://) and the only window with
/// Tauri API access - see capabilities/settings.json.
pub(crate) fn open_or_focus_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    if let Err(err) =
        WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
            .title("Guidon Desktop Settings")
            .inner_size(480.0, 340.0)
            .resizable(false)
            .minimizable(false)
            .maximizable(false)
            .build()
    {
        log_settings_window_error(app, &err);
    }
}

/// Record a settings-window-open failure to a log file under the app's data
/// directory. A packaged Windows GUI-subsystem exe (see main.rs's
/// `windows_subsystem = "windows"`) has no attached console, so the
/// previous `eprintln!` was invisible to a real user - the menu item would
/// just silently do nothing. This leaves a trail without pulling in a full
/// logging framework or a dialog-plugin dependency for one error path.
fn log_settings_window_error(app: &AppHandle, err: &tauri::Error) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("guidon-desktop.log"))
    else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = writeln!(file, "[{timestamp}] failed to open settings window: {err}");
}
