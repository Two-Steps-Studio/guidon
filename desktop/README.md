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
  (`src-tauri/src/lib.rs`'s `get_server_url`/`save_server_url`
  commands, backed by `tauri-plugin-store`) and read back on the next
  launch to decide the `main` window's initial URL. This is the only
  window granted any Tauri API access, scoped narrowly to those two
  commands in `src-tauri/capabilities/settings.json` — see that file's
  description before widening it.

Both windows are created at runtime in `src-tauri/src/lib.rs`'s
`setup()` hook (not declared statically in `tauri.conf.json`'s
`app.windows`, which is empty) so the `main` window's URL can be
decided from the persisted config before it's built.

`tauri.conf.json`'s `app.security.csp` is a real, restrictive policy
(`default-src 'self'` plus the `ipc:`/`http://ipc.localhost` allowance
IPC needs) — it only applies to `tauri://` content, i.e. the `settings`
window, since `main` loads an external `https://` URL. Keep it tight:
the settings page has no inline scripts/styles on purpose so `'self'`
is enough, without `'unsafe-inline'`.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
