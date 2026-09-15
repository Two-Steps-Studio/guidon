// The main window shows untrusted remote content (see
// capabilities/default.json's own comment) and is granted ZERO Tauri API
// access. The Settings window built in setup() below is local, bundled
// content (served via tauri://) and is the only window with API access -
// see capabilities/settings.json. Before registering a new plugin or
// command here, check whether doing so would give the main window
// something new to reach for; tauri-plugin-opener (scaffolded by default,
// removed in an earlier commit) is exactly that kind of trap.
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

/// Guidon Cloud - the default server URL for a first run / empty store.
const DEFAULT_SERVER_URL: &str = "https://useguidon.com";
/// Local config file backing the Store plugin, resolved under the app's
/// data directory (`com.guidon.desktop`, per tauri.conf.json's identifier).
const STORE_FILE: &str = "config.json";
/// Key the chosen server URL is persisted under inside that store.
const SERVER_URL_KEY: &str = "server_url";

const OPEN_SETTINGS_MENU_ID: &str = "open_settings";

/// Validate that `raw` is a plausible http(s) server URL, returning the
/// parsed, normalized `Url` on success.
fn validate_server_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Server URL must start with http:// or https://".into());
    }
    let parsed = Url::parse(trimmed).map_err(|e| format!("Invalid URL: {e}"))?;
    if parsed.host_str().is_none_or(str::is_empty) {
        return Err("Server URL must include a host".into());
    }
    Ok(parsed)
}

/// Read the currently persisted server URL, falling back to Guidon Cloud if
/// the store is empty (first run) or holds something invalid.
fn stored_server_url(app: &AppHandle) -> Url {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(SERVER_URL_KEY))
        .and_then(|value| value.as_str().map(str::to_string))
        .and_then(|raw| validate_server_url(&raw).ok())
        .unwrap_or_else(|| Url::parse(DEFAULT_SERVER_URL).expect("default URL is valid"))
}

/// Show the Settings window, creating it on first use.
fn open_or_focus_settings(app: &AppHandle) {
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
        eprintln!("failed to open settings window: {err}");
    }
}

/// Return the currently persisted server URL (or the Guidon Cloud default)
/// for the Settings page to pre-fill its input with. The Store plugin's own
/// JS bindings need a bundler to resolve their `@tauri-apps/api/*` imports,
/// which this unbundled static frontend doesn't have, so this command -
/// backed by the same plugin on the Rust side - is the read path instead.
#[tauri::command]
fn get_server_url(app: AppHandle) -> String {
    stored_server_url(&app).to_string()
}

/// Persist a new server URL and reload the main window at it. This is the
/// only way the Settings window can affect the main window - it cannot
/// reach it directly since the JS window API doesn't expose cross-window
/// navigation, only Rust's `WebviewWindow::navigate` does.
#[tauri::command]
fn save_server_url(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = validate_server_url(&url)?;

    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(SERVER_URL_KEY, parsed.as_str());
    store.save().map_err(|e| e.to_string())?;

    match app.get_webview_window("main") {
        Some(main) => main.navigate(parsed).map_err(|e| e.to_string()),
        None => Err("main window is not available".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_server_url, save_server_url])
        .setup(|app| {
            let handle = app.handle().clone();

            // The main window's initial URL is whatever is currently
            // persisted (Task 2), not a value hardcoded in tauri.conf.json
            // (Task 1) - this is how a self-hosted user points the app at
            // their own server and has it stick across restarts.
            let main_url = stored_server_url(&handle);
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(main_url))
                .title("Guidon Desktop")
                .inner_size(800.0, 600.0)
                .build()?;

            // The main window shows untrusted remote content with zero API
            // access, so it can't open Settings itself - the only entry
            // point is this native menu item.
            let open_settings =
                MenuItemBuilder::with_id(OPEN_SETTINGS_MENU_ID, "Settings...").build(app)?;
            let app_menu = SubmenuBuilder::new(app, "Guidon Desktop")
                .item(&open_settings)
                .separator()
                .quit()
                .build()?;
            let menu = MenuBuilder::new(app).item(&app_menu).build()?;
            app.set_menu(menu)?;

            let menu_handle = handle.clone();
            app.on_menu_event(move |_app, event| {
                if event.id() == OPEN_SETTINGS_MENU_ID {
                    open_or_focus_settings(&menu_handle);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
