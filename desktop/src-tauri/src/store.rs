// Server URL persistence (Task 2 of the desktop plan): validation, the
// on-disk config store, and the two Tauri commands the Settings window
// (desktop/src/settings.js) calls to read/write it.
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use url::Url;

/// Guidon Cloud - the default server URL for a first run / empty store.
const DEFAULT_SERVER_URL: &str = "https://useguidon.com";
/// Local config file backing the Store plugin, resolved under the app's
/// data directory (`com.guidon.desktop`, per tauri.conf.json's identifier).
const STORE_FILE: &str = "config.json";
/// Key the chosen server URL is persisted under inside that store.
const SERVER_URL_KEY: &str = "server_url";

/// Validate that `raw` is a plausible http(s) server URL, returning the
/// parsed, normalized `Url` on success.
///
/// Parses first and checks `scheme()` afterwards, rather than a prefix
/// check on the raw string, so casing doesn't matter: `Url::parse`
/// lowercases the scheme per the URL spec, so `HTTP://...` is accepted the
/// same as `http://...`. This has to agree with the client-side check in
/// settings.js's `isPlausibleUrl`, which is already case-insensitive - a
/// case-sensitive prefix check here previously let a user type
/// `HTTP://...`, pass the JS-side check, and then have the form submit
/// only to be rejected by this command.
fn validate_server_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    let parsed = Url::parse(trimmed).map_err(|e| format!("Invalid URL: {e}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Server URL must start with http:// or https://".into());
    }
    if parsed.host_str().is_none_or(str::is_empty) {
        return Err("Server URL must include a host".into());
    }
    Ok(parsed)
}

/// Read the currently persisted server URL, falling back to Guidon Cloud if
/// the store is empty (first run) or holds something invalid.
pub(crate) fn stored_server_url(app: &AppHandle) -> Url {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(SERVER_URL_KEY))
        .and_then(|value| value.as_str().map(str::to_string))
        .and_then(|raw| validate_server_url(&raw).ok())
        .unwrap_or_else(|| Url::parse(DEFAULT_SERVER_URL).expect("default URL is valid"))
}

/// Return the currently persisted server URL (or the Guidon Cloud default)
/// for the Settings page to pre-fill its input with. The Store plugin's own
/// JS bindings need a bundler to resolve their `@tauri-apps/api/*` imports,
/// which this unbundled static frontend doesn't have, so this command -
/// backed by the same plugin on the Rust side - is the read path instead.
#[tauri::command]
pub(crate) fn get_server_url(app: AppHandle) -> String {
    stored_server_url(&app).to_string()
}

/// Persist a new server URL and reload the main window at it. This is the
/// only way the Settings window can affect the main window - it cannot
/// reach it directly since the JS window API doesn't expose cross-window
/// navigation, only Rust's `WebviewWindow::navigate` does.
#[tauri::command]
pub(crate) fn save_server_url(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = validate_server_url(&url)?;

    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(SERVER_URL_KEY, parsed.as_str());
    store.save().map_err(|e| e.to_string())?;

    match app.get_webview_window("main") {
        Some(main) => main.navigate(parsed).map_err(|e| e.to_string()),
        None => Err("main window is not available".into()),
    }
}
