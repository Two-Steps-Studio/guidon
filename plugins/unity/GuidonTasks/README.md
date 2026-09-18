# Guidon Tasks for Unity

View a Guidon project's tasks, change a task's status, and read/post
comments - without leaving the Unity Editor.

## What this is (and isn't)

This is an Editor-only tool (`Editor/` folder + an asmdef restricted to
`"includePlatforms": ["Editor"]`), so it never ships inside a player
build - no API key or task data can end up in a game your players run.

It talks to your existing Guidon instance's public API
(`/api/v1` - see [the API's own README](../../../src/app/api/v1/README.md)).
Logging in opens the real Guidon website in your browser - the same login
page, password reset, and OAuth you already use - rather than a
reimplemented login form inside the Editor. Behind the scenes this is a
loopback flow (the same pattern tools like `gh auth login` or `gcloud auth
login` use): the plugin starts a tiny local HTTP server, sends your
browser to `/auth/plugin-login` on your Guidon instance, and once you
click **Authorize** there (already logged in, or after logging in if you
weren't), the site redirects your browser back to that local server with a
freshly issued API key. The plugin never sees or stores your password -
only the resulting key. That key shows up under **Profile → API Keys** on
the website as "Unity Plugin", so you can revoke it there if a machine is
ever lost.

## Setup

1. **Install**: copy the whole `GuidonTasks` folder into your Unity
   project, anywhere under `Assets/` (e.g. `Assets/Editor/GuidonTasks` or
   just `Assets/GuidonTasks` - only the `Editor/` subfolder has code, so
   the location outside it doesn't matter).
2. In Unity, open **Window → Guidon → Tasks**. Expand **Settings**, set
   **Base URL** to your Guidon instance (e.g. `https://useguidon.com` or
   `http://localhost:2137` for a local dev server), then click **Log In**.
   Your browser opens to a Guidon page asking you to approve the plugin -
   approve it, and the Unity window picks up the result automatically
   (usually within a second or two of clicking Authorize).

   The resulting API key is stored in `EditorPrefs` (machine-wide, not
   inside your Unity project) so it never risks being committed to your
   project's own git repo - the trade-off is that it's shared across every
   Unity project you open on this machine, not scoped to just this one.
   **Log Out** just clears it locally; it does not revoke the key
   server-side (logging back in reissues a fresh one either way).
3. Pick a project from the dropdown in the toolbar. Its tasks load on the
   left; click one to see its description, status, and comments on the
   right.

### If the browser can't reach Unity

The local listener tries ports 51820-51829 and gives up with a clear error
if none are free - close any other in-progress Guidon login (Unity or
otherwise) and try again. A corporate firewall or antivirus that blocks
local loopback listeners would also prevent this from completing; there is
no fallback path in v1 if that's the case for your machine.

## Known limitation: status changes can 403

Guidon gates status changes and "done" specifically through a project's
**AI Permissions** (Project → Settings → AI Permissions) - the same gate
an AI agent hitting this API goes through, which this plugin also goes
through since logging in just gets you a regular scoped API key under the
hood:

- Changing status to anything except "Done" needs `can_change_status`
  (**on** by default).
- Marking a task "Done" additionally needs the project's
  **Allow AI Auto-Complete** setting plus `can_complete_tasks` (**off** by
  default).

If a status change 403s, the plugin shows the server's own error message
verbatim - it'll tell you exactly which setting to flip in Project Settings.

## Not implemented (v1)

- No background auto-refresh - use the **Refresh** button. An always-on
  poll while the window sits unfocused isn't worth the editor overhead for
  a "glance at it" tool.
- No task creation, editing, or deletion - viewing, status changes, and
  comments only.
- Unreal Engine 5 support is a separate, not-yet-built plugin.
