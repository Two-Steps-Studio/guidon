// Window lifecycle: creating the main (untrusted, remote-content) window at
// startup, the small Tasks window and the local Settings window on demand.
use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use url::Url;

use crate::store::{stored_server_url, stored_tasks_on_top};

pub(crate) const TASKS_WINDOW_LABEL: &str = "tasks";
pub(crate) const PLUGINS_WINDOW_LABEL: &str = "plugins";

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
        // First-run size; afterwards tauri-plugin-window-state restores
        // whatever the user left it at (lib.rs).
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 480.0)
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
    hide_instead_of_close(&window);

    Ok(())
}

fn hide_instead_of_close(window: &WebviewWindow) {
    let window_for_event = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_for_event.hide();
        }
    });
}

/// The web app's compact task list (src/app/mini) on the given server.
/// Pushes a path segment rather than `Url::join("mini")`, which would drop
/// the last segment of a self-hosted server living under a sub-path.
pub(crate) fn tasks_url(server: &Url) -> Url {
    let mut url = server.clone();
    url.set_query(None);
    url.set_fragment(None);
    if let Ok(mut segments) = url.path_segments_mut() {
        segments.pop_if_empty().push("mini");
    }
    url
}

/// Show the small Tasks window, creating it on first use. Same trust level
/// as the main window - remote content, zero Tauri API access (it shares
/// capabilities/default.json) - and the same browser session, so no extra
/// sign-in. Closing it hides it, like the main window.
pub(crate) fn open_or_focus_tasks(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(TASKS_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let url = tasks_url(&stored_server_url(app));
    match WebviewWindowBuilder::new(app, TASKS_WINDOW_LABEL, WebviewUrl::External(url))
        .title("Guidon Tasks")
        .inner_size(380.0, 600.0)
        .min_inner_size(300.0, 360.0)
        .always_on_top(stored_tasks_on_top(app))
        .build()
    {
        Ok(window) => hide_instead_of_close(&window),
        Err(err) => log_app_error(app, &format!("failed to open tasks window: {err}")),
    }
}

pub(crate) fn set_tasks_on_top(app: &AppHandle, on_top: bool) {
    crate::store::save_tasks_on_top(app, on_top);
    if let Some(window) = app.get_webview_window(TASKS_WINDOW_LABEL) {
        let _ = window.set_always_on_top(on_top);
    }
}

/// Bring the main window to the front - used when a second launch is
/// redirected here by the single-instance plugin (lib.rs).
pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Toggle the main window's visibility - used by both the tray icon's own
/// click and its "Show/Hide Guidon" menu item (tray.rs). Hidden rather than
/// destroyed by close-to-tray above, so this is a plain show/hide flip, not
/// a re-create.
pub(crate) fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // is_visible() stays true even while minimized on Windows, so a plain
    // visibility check alone would "hide" a minimized-but-visible window on
    // the next click instead of restoring it to the foreground - checking
    // is_minimized() first routes that case to the restore branch instead.
    let minimized = window.is_minimized().unwrap_or(false);
    if window.is_visible().unwrap_or(false) && !minimized {
        let _ = window.hide();
    } else {
        let _ = window.unminimize();
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
        log_app_error(app, &format!("failed to open settings window: {err}"));
    }
}

/// Show the Install Editor Plugins window, creating it on first use. Local,
/// bundled content like Settings, with only the installer commands
/// (capabilities/plugins.json).
pub(crate) fn open_or_focus_plugins(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(PLUGINS_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    if let Err(err) = WebviewWindowBuilder::new(
        app,
        PLUGINS_WINDOW_LABEL,
        WebviewUrl::App("plugins.html".into()),
    )
    .title("Install Editor Plugins")
    .inner_size(560.0, 640.0)
    .min_inner_size(440.0, 480.0)
    .build()
    {
        log_app_error(app, &format!("failed to open plugins window: {err}"));
    }
}

/// Record a non-fatal failure to a log file under the app's data directory,
/// rather than crashing or (the previous behavior) `eprintln!`-ing into a
/// console a packaged Windows GUI-subsystem exe doesn't have (see main.rs's
/// `windows_subsystem = "windows"`) - that made failures invisible to a
/// real user, with no trail to debug from. Shared by any module that hits a
/// recoverable setup failure (settings window creation here; the tray
/// icon's missing-default-icon case in tray.rs) rather than duplicating
/// this per call site or pulling in a full logging framework/dialog-plugin
/// dependency for what's meant to be a rare fallback path.
pub(crate) fn log_app_error(app: &AppHandle, message: &str) {
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
    let _ = writeln!(file, "[{timestamp}] {message}");
}

#[cfg(test)]
mod tests {
    use super::tasks_url;
    use url::Url;

    fn url(raw: &str) -> String {
        tasks_url(&Url::parse(raw).unwrap()).to_string()
    }

    #[test]
    fn appends_mini_to_the_server_url() {
        assert_eq!(url("https://useguidon.com"), "https://useguidon.com/mini");
        assert_eq!(url("https://useguidon.com/"), "https://useguidon.com/mini");
        assert_eq!(url("http://10.0.0.5:2137"), "http://10.0.0.5:2137/mini");
    }

    #[test]
    fn keeps_a_self_hosted_sub_path() {
        assert_eq!(
            url("https://example.com/guidon"),
            "https://example.com/guidon/mini"
        );
        assert_eq!(
            url("https://example.com/guidon/"),
            "https://example.com/guidon/mini"
        );
    }

    #[test]
    fn drops_query_and_fragment() {
        assert_eq!(
            url("https://example.com/?a=1#x"),
            "https://example.com/mini"
        );
    }
}
