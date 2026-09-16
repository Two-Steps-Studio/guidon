# Guidon Desktop

A thin Tauri shell around Guidon's existing web app. Two windows:

- **`main`** — loads a Guidon server URL directly (Guidon Cloud by
  default, or a self-hosted instance chosen in Settings). No bundled
  backend, no offline mode; see
  `docs/superpowers/specs/2026-09-15-desktop-app-design.md` (repo root)
  for the full design and why. This window shows untrusted remote
  content and is granted zero Tauri API access (see
  `src-tauri/capabilities/default.json`'s own description field) —
  don't add permissions there without re-reading that file's warning
  first.
- **`settings`** — local, bundled content (`src/index.html` +
  `src/settings.js`, served via `tauri://`, never remote), opened from
  the native "Guidon Desktop" → "Settings..." menu item (the main
  window can't open it itself, since it has no API access). Lets you
  change the server URL; it's persisted via the Store plugin
  (`src-tauri/src/store.rs`'s `get_server_url`/`save_server_url`
  commands, backed by `tauri-plugin-store`) and read back on the next
  launch to decide the `main` window's initial URL. It also has a
  "Start Guidon Desktop when Windows starts" checkbox (autostart, see
  below). This is the only window granted any Tauri API access, scoped
  narrowly to those four commands in
  `src-tauri/capabilities/settings.json` — see that file's description
  before widening it.

Both windows are created at runtime in `src-tauri/src/lib.rs`'s
`setup()` hook (not declared statically in `tauri.conf.json`'s
`app.windows`, which is empty) so the `main` window's URL can be
decided from the persisted config before it's built.

## Tray icon and close-to-tray

The app stays running in the Windows system tray after the `main`
window is closed, rather than quitting like a typical window's X
button:

- **Tray icon** (`src-tauri/src/tray.rs`) — built at runtime with
  `tauri::tray::TrayIconBuilder`, reusing the app's existing bundled
  icon (`icons/icon.ico`, via `app.default_window_icon()`) rather than
  a separate tray-specific asset. Left-clicking the icon itself toggles
  the `main` window's visibility (`show_menu_on_left_click(false)` is
  set so a left click reaches `on_tray_icon_event` instead of popping
  the menu). Right-clicking shows a menu with two items:
  - **Show/Hide Guidon** — same toggle as clicking the icon.
  - **Quit** — the only thing that actually calls `app.exit(0)`; see
    below.
- **Close-to-tray** (`src-tauri/src/windows.rs`,
  `create_main_window`) — the `main` window's `CloseRequested` event
  is intercepted: `api.prevent_close()` stops the default "close this
  window" behavior and the window is hidden instead
  (`window.hide()`). The process keeps running - only the tray menu's
  "Quit" item exits it for real. This is why `main` staying hidden
  (rather than being destroyed) doesn't also end the app: Tauri would
  otherwise exit once its last window is gone, but a hidden window is
  still a window.

The `tauri` dependency in `src-tauri/Cargo.toml` explicitly enables
the `tray-icon` Cargo feature (off by default) - without it, none of
`tauri::tray::*` is available to import at all.

Building the tray icon and the close-to-tray hook fully in Rust (like
both windows above) rather than declaring `app.trayIcon` in
`tauri.conf.json` keeps them consistent with the rest of this app's
"decided in `setup()`, not static config" approach, and needs no
capability/permission changes since none of it is invoked from JS.

`tauri.conf.json`'s `app.security.csp` is a real, restrictive policy
(`default-src 'self'` plus the `ipc:`/`http://ipc.localhost` allowance
IPC needs) — it only applies to `tauri://` content, i.e. the `settings`
window, since `main` loads an external `https://` URL. Keep it tight:
the settings page has no inline scripts/styles on purpose so `'self'`
is enough, without `'unsafe-inline'`.

## Autostart at login

The Settings window's "Start Guidon Desktop when Windows starts"
checkbox toggles whether the app registers itself to launch at
Windows login, via `tauri-plugin-autostart`
(`src-tauri/src/autostart.rs`):

- **Rust side** — `autostart.rs` wraps the plugin's
  `AutoLaunchManager` (reached through
  `tauri_plugin_autostart::ManagerExt::autolaunch()`) in two thin app
  commands, `get_autostart_enabled`/`set_autostart_enabled`, the same
  pattern `store.rs` uses for the Store plugin and for the same
  reason: the plugin's own `@tauri-apps/plugin-autostart` JS bindings
  need a bundler this unbundled static frontend doesn't have. The
  plugin itself is registered in `src/lib.rs`
  (`tauri_plugin_autostart::Builder::new().build()`); on Windows it
  registers the app via the `HKCU\...\Run` registry key, under the
  app's `productName` ("Guidon Desktop" — that's the name shown in
  Task Manager's Startup apps tab once enabled).
- **JS side** — `src/settings.js` reads the current state on load
  (`get_autostart_enabled`) so the checkbox reflects reality instead
  of defaulting to unchecked, and calls `set_autostart_enabled` on
  every toggle, reverting the checkbox and showing an error if the
  call fails.
- **Capability** — `cargo tauri add autostart` scaffolded a
  `capabilities/desktop.json` granting the plugin's raw
  `autostart:default` permission set to the `main` window by default.
  That file was deleted; the grant instead lives in
  `capabilities/settings.json`, scoped to the `settings` window only
  and to the two app commands above (`allow-get-autostart-enabled`/
  `allow-set-autostart-enabled`) — the plugin's raw
  `plugin:autostart|*` commands are not granted to any window. See
  `build.rs` for how those two app commands get their own ACL
  permission identifiers generated in the first place.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
