# Guidon Desktop (Tauri, Windows)

## Problem

Guidon only runs in a browser tab today. A desktop app gives it its own
window, a dock/taskbar presence, a system-tray icon to live in the
background, and (later) native notifications — the way Slack, Discord,
Linear, and Notion's desktop apps work for their own web products.

## Design

### Approach: a thin native shell, not a bundled server

Two fundamentally different ways to "desktop-ify" a full-stack Next.js
app were considered:

1. **Thin wrapper (chosen)**: Tauri opens a native window with a
   WebView pointed at an already-running Guidon instance — hosted
   (Guidon Cloud) or self-hosted, whichever URL the user configures.
   Zero backend changes; the web app is unaware it's running inside
   Tauri at all.
2. **Bundled server**: package the whole Next.js standalone server as
   a sidecar process inside the app, for offline use. Rejected for
   this round — it's effectively a third deployment mode alongside
   hosted/self-hosted (bundling a Node runtime, managing a local
   port, and still needing *some* database — remote Supabase or a
   bundled Postgres), a much larger and more ongoing maintenance
   commitment than what a first desktop app needs to prove out.

### Security posture: remote content gets zero native API access

The loaded page (Guidon Cloud or a self-hosted instance) is treated as
untrusted remote content — it is granted **no** Tauri command access
(filesystem, shell, etc.). Every native feature (tray, autostart,
updater, the server-URL setting) is implemented entirely in the Tauri
shell layer (Rust + a small local bundled UI), never by the remote
page calling into Tauri. This sidesteps Tauri's capability/CSP
configuration entirely for the main content window and means a
compromised or malicious page loaded via a misconfigured self-hosted
URL can't reach outside the browser sandbox.

### Server selection

A small **local** settings window (bundled with the app, not fetched
from the remote server) holds one field: the Guidon server URL,
defaulting to `https://useguidon.com`. Saved to Tauri's local app
config. The main window navigates to whatever URL is currently
configured; changing it in Settings triggers a reload of the main
window at the new URL. This is how a self-hosted user points the app
at their own instance instead of Guidon Cloud.

Because this settings window is local bundled content, it can safely
use Tauri APIs (reading/writing the config) — the separation from the
remote-content main window is what keeps the "zero API access for
remote content" rule simple to reason about.

### Session persistence

WebView2 (the Windows WebView Tauri uses) keeps its own persistent
profile per app data directory, the same way a browser profile
persists cookies/localStorage across restarts. Login "just works" the
same way it does in a browser tab — no special session-bridging code
needed.

### Tray and window behavior

- A system tray icon with a menu: Show/Hide, Quit.
- Closing the main window hides it to tray instead of quitting the
  process (matches Slack/Discord convention) — Quit is only reachable
  from the tray menu or a native "Exit" action.
- Optional autostart at Windows login, toggled from the local Settings
  window, via Tauri's official `tauri-plugin-autostart`.

### Auto-update

`tauri-plugin-updater`, checking a `latest.json` manifest published
alongside GitHub Releases for this repo (Tauri's release workflow can
generate this manifest automatically). No custom update server needed.
Requires release artifacts to be publicly fetchable — if this repo or
its releases are ever made private, the update channel needs to move
to a separate public static host; out of scope to solve now since the
repo is currently public-reachable for this purpose.

Windows installers are unsigned for this first round — SmartScreen
will show a warning on first run, standard for a new unsigned app. A
code-signing certificate is a separate, later decision (has an
ongoing cost), not a blocker for shipping v1.

### Explicitly deferred

- **Native OS notifications**: Guidon has no notification system at
  all today — no notifications table, no server-side detection of
  "new comment" / "task assigned to you" events, nothing in the
  browser UI either. Wiring native notifications to nothing meaningful
  isn't worth building. A real in-app notification system is a
  separate, larger feature; native desktop notifications are a
  natural follow-up once that exists, not part of this round.
- **macOS / Linux builds**: Tauri compiles the same codebase for all
  three from day one architecturally, so this is a "flip it on later"
  decision, not a rewrite. Windows-only for this round since that's
  the platform in active use right now.

### Repo layout

New top-level `desktop/` directory (a Tauri project is its own
Cargo/Rust workspace, kept separate from `src/` to avoid any confusion
with the Next.js app it points at):

```
desktop/
  src-tauri/
    src/main.rs           # tray setup, window-close-to-tray, updater wiring
    tauri.conf.json        # app metadata, window config, updater manifest URL
    capabilities/           # explicit allow-list for the local settings window only
    Cargo.toml
  settings-ui/              # tiny local HTML/JS page for the server-URL + autostart toggle
    index.html
```

Nothing under `desktop/` is built or deployed by the existing
`npm run build`/Vercel/Docker pipelines — it's an independent build
artifact (a Windows installer), built and released separately.

### Verification

- `cargo build` / `npm run tauri build` (inside `desktop/`) produces a
  working Windows installer.
- Manual: install, launch, confirm it loads Guidon Cloud by default;
  change the server URL in Settings to a local dev server
  (`http://localhost:2137`) and confirm it reloads there and a normal
  login persists across an app restart; confirm closing the window
  hides to tray rather than quitting; confirm the tray menu's Quit
  actually exits the process; confirm autostart toggles a real Windows
  startup entry (`shell:startup` or the registry `Run` key, whichever
  the plugin uses) when enabled/disabled.
- No automated test suite applies here (this is a separate native
  build, not part of the Next.js app's `tsc`/`lint`/`test:db` surface).

## Out of scope

- Bundling the Next.js server for offline use (see "Approach" above).
- Native OS notifications (see "Explicitly deferred").
- macOS/Linux builds (see "Explicitly deferred").
- Code signing / notarization.
- Deep-linking (`guidon://` protocol handlers).
