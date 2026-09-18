# Guidon Tasks for Unity

View a Guidon project's tasks, change a task's status, and read/post
comments - without leaving the Unity Editor.

## What this is (and isn't)

This is an Editor-only tool (`Editor/` folder + an asmdef restricted to
`"includePlatforms": ["Editor"]`), so it never ships inside a player
build - no API key or task data can end up in a game your players run.

It talks to your existing Guidon instance's public API
(`/api/v1` - see [the API's own README](../../../src/app/api/v1/README.md))
using a personal API key, exactly the same way the Discord bot integration
or an AI agent would. There is no new backend just for this plugin beyond
two small read-only additions (listing your projects, listing a task's
comments) - everything else already existed.

## Setup

1. **Install**: copy the whole `GuidonTasks` folder into your Unity
   project, anywhere under `Assets/` (e.g. `Assets/Editor/GuidonTasks` or
   just `Assets/GuidonTasks` - only the `Editor/` subfolder has code, so
   the location outside it doesn't matter).
2. **Create an API key** in Guidon: go to **Profile → API Keys**, create a
   new key with these scopes:
   - `tasks:read` (view projects, tasks, and comments)
   - `tasks:status` (change a task's status)
   - `comments:write` (post a comment)

   Copy the key immediately - Guidon only shows it once.
3. In Unity, open **Window → Guidon → Tasks**. Expand **Settings**, set:
   - **Base URL**: your Guidon instance, e.g. `https://useguidon.com` or
     `http://localhost:2137` for a local dev server.
   - **API Key**: the key from step 2.

   Click **Save**. The key is stored in `EditorPrefs` (machine-wide, not
   inside your Unity project) so it never risks being committed to your
   project's own git repo - the trade-off is that it's shared across every
   Unity project you open on this machine, not scoped to just this one.
4. Pick a project from the dropdown in the toolbar. Its tasks load on the
   left; click one to see its description, status, and comments on the
   right.

## Known limitation: status changes can 403

Guidon gates status changes and "done" specifically through a project's
**AI Permissions** (Project → Settings → AI Permissions) - the same gate
an AI agent hitting this API goes through, which this plugin also goes
through since it's just another API-key caller:

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
