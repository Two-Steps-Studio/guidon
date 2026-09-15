# Guidon Desktop

A thin Tauri shell around Guidon's existing web app — the main window
loads a Guidon server URL directly (Guidon Cloud by default, or a
self-hosted instance once Task 2 adds a settings screen for that). No
bundled backend, no offline mode; see
`docs/superpowers/specs/2026-09-15-desktop-app-design.md` (repo root)
for the full design and why.

`src/` (the vanilla HTML/JS scaffold `create-tauri-app` generated) is
**not used by the main window** and stays inert until Task 2 repurposes
it as a local Settings window — the main window's content comes
entirely from the remote URL configured in `src-tauri/tauri.conf.json`.

The main window is treated as untrusted remote content and is granted
zero Tauri API access (see `src-tauri/capabilities/default.json`'s own
description field) — don't add permissions there without re-reading
that file's warning first.

**Known follow-up, not yet done**: `tauri.conf.json`'s `security.csp`
is `null`, which is a no-op today (CSP only applies to content served
via the local `tauri://` asset protocol, and the main window loads an
external `https://` URL instead). Once Task 2's local Settings window
ships — genuinely local, genuinely privileged — revisit this key; a
`null` CSP would then also apply to a window that actually has API
access, which is a different risk profile than today's remote-only
window.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
