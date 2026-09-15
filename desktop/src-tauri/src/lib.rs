// No plugins/commands registered yet beyond Tauri's own defaults. The main
// window shows untrusted remote content (see capabilities/default.json's
// own comment) - before registering a plugin here, check whether doing so
// would give that window something new to reach for. tauri-plugin-opener
// (scaffolded by default, removed here) is exactly that kind of trap: it's
// harmless only as long as capabilities/default.json's permissions array
// stays empty, and re-adding it "for the app" without re-reading that
// file's warning would hand the remote page (or a malicious self-hosted
// URL) the ability to open arbitrary files/URLs via the shell.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
