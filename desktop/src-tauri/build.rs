fn main() {
    // `get_server_url`/`save_server_url` are the app-defined commands (see
    // src/lib.rs) the Settings window uses to read/persist the server URL -
    // Store plugin JS bindings need a bundler to resolve their bare
    // `@tauri-apps/api/*` imports, which this unbundled static frontend
    // doesn't have, so these commands are the JS-callable surface instead
    // (the Rust side still uses the Store plugin itself). Declaring them
    // here generates their ACL permission identifiers so they can be
    // granted to the Settings window's capability only
    // (capabilities/settings.json) and never to the untrusted `main` window.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["get_server_url", "save_server_url"]),
    ))
    .expect("failed to run tauri-build");
}
