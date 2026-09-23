# Guidon Tasks for Unreal Engine 5

> See [`../../CONVENTIONS.md`](../../CONVENTIONS.md) for the terminology/login-flow standard every Guidon plugin follows.

A Kanban board for a Guidon project inside the Unreal Editor. You can view,
create, edit, drag cards between columns, delete, add subtasks to and comment
on tasks without leaving the editor. It's the UE5 counterpart of the
[Unity plugin](../../unity/GuidonTasks/README.md) and talks to the same
public API (`/api/v1`, see [the API's README](../../../src/app/api/v1/README.md)).

> **Status: not compiled yet.** This plugin was written without an Unreal
> Engine toolchain available, so it has never been built. It targets
> **UE 5.3 or newer** using the stock `HTTP`, `HTTPServer`, `Json`,
> `ToolMenus` and Slate modules. Expect a small first-build fix or two,
> most likely around engine API differences between versions. The one
> version switch already in the code is `FHttpRequestHandler`, a delegate
> from 5.4 and a `TFunction` before that (`GuidonAuth.cpp`). Please report
> build errors with the engine version.

## What it is

It's an **Editor** module (`"Type": "Editor"` in `GuidonTasks.uplugin`), so it
never ships in a packaged game and no API key or task data can end up in a
build your players run.

The UI is Slate. Colors come from the web app's dark theme tokens, the same
values as the Unity plugin's dark palette. Each column has the site's
colored status dot, and cards show a description preview, tags, priority,
due date and subtask progress (`✓ 2/5`).

## Setup

1. **Install:** run `install.ps1` from this folder against your project, e.g.:

   ```powershell
   ./install.ps1 -ProjectPath "C:\Users\you\Documents\Unreal Projects\MyGame"
   ```

   It copies the plugin into `<YourProject>/Plugins/GuidonTasks/` and prints
   the exact next steps for your project (it detects whether you need to add
   a C++ class first). Doing it by hand is the same: copy the `GuidonTasks`
   folder into your project's `Plugins/` folder
   (`<YourProject>/Plugins/GuidonTasks/GuidonTasks.uplugin`), then reopen the
   project and let the editor build the module. A C++ project is needed for
   that. A Blueprint-only project has to add one C++ class first (see
   Troubleshooting below), or you build the plugin once from a C++ project
   and copy the result over.
2. Open **Window → Guidon Tasks**. Check the **Base URL**
   (`https://useguidon.com`, or `http://localhost:2137` for a local dev
   server) and click **Log In**. Your browser opens the Guidon website. Click
   **Authorize** there and the tab picks up the key automatically.
3. Pick a project in the toolbar. Then:
   - Click a card to open it in the details panel on the right. There you
     edit the title, priority, due date (`YYYY-MM-DD`) and the Markdown
     description, then **Save**.
   - The status dropdown in the details panel changes the status right away.
   - Drag a card onto another column to change its status. It lands at the
     end of that column.
   - **+** on a column opens an inline title box. **Enter** creates the task,
     **Esc** cancels.
   - Subtasks: the checkbox toggles done/todo. The box below adds one with
     Enter. Clicking a subtask opens it, and **← Back to parent task** returns
     to its parent.
   - Comments: write a comment and click **Post**.
   - **Copy Git ref** copies `guidon#1a2b3c4d`. Put it in a commit, PR or
     branch name, and the GitHub integration links and moves the task.

## Board columns

The board shows the project's own columns: the labels, order and hidden
columns set in the web app's project settings, loaded from
`GET /api/v1/projects/{id}/columns`. The status list offers only visible
columns. Against an older Guidon without that endpoint, the plugin falls
back to the six default columns.

## Login and storage

Login uses the same loopback flow as the Unity plugin. The engine's
`HTTPServer` binds `/callback` on the first free port in 51820-51829. The
browser goes to `/auth/plugin-login?client=unreal` and is redirected back
there with a freshly issued key. The plugin never sees your password.
Waiting times out after 5 minutes. **Cancel** stops it sooner.

To make a busy port fail right away instead of silently later, the login
calls `FHttpServerModule::StartAllListeners()`. That also starts any other
HTTPServer listeners registered in the editor, such as Remote Control's.
After login only the plugin's own route is unbound. The listener on that
port stays up until the editor closes, because it may be shared.

The key is stored machine-wide with `FPlatformMisc::SetStoredValue`: the
registry under `HKCU\Software\Guidon\GuidonTasks` on Windows, a per-user
config file elsewhere. It is never in the project's `Config/` folder, so it
can't be committed to your game's repo. It appears on the website under
**Profile → API Keys** as **"Unreal Plugin"**, separate from the Unity and
Blender keys. **Log Out** clears the key locally but doesn't revoke it on
the server. Revoke it on the website if you lose a machine.

## Status changes and permissions

Status changes follow the project's permission rules. When the server
refuses a change, the card goes back to its old column and the server's
error message appears in the red bar under the toolbar.

## Troubleshooting

- **"This project does not have any source code. You need to add C++ source
  files to the project from the Editor before you can generate project
  files."** Your project is Blueprint-only. In the editor: **Tools → New C++
  Class...** → base class **None** → **Create Class**. Accept the default
  name. The editor closes to add a `Source/` folder and regenerate project
  files; this turns your project into a C++ project (required for any C++
  plugin, not just this one). After that, generating project files and
  building works as normal.
- **"The following modules are missing or built with a different engine
  version: ... GuidonTasks. Would you like to rebuild them now?"** This is
  expected on first use — the plugin ships as source and has never been
  compiled for your engine version. Click **Yes**. If your project lists
  *other* modules alongside `GuidonTasks` in that prompt, those are
  pre-existing plugins/modules in your project unrelated to Guidon; a
  failure in one of them can block the whole rebuild. To isolate whether
  `GuidonTasks` itself compiles, test it in a fresh, empty C++ project first
  (File → New Project → Blank, with a starter C++ class) before adding it to
  a project that already has other custom plugins.
- **A module other than `GuidonTasks` fails to compile** ("`X` could not be
  compiled. Try rebuilding from source manually."): that's a problem with
  that other module, not this plugin. Fix or remove it, or test GuidonTasks
  in a clean project as above.
- **GuidonTasks itself fails to compile**: please report the build error
  together with your exact engine version (`Help → About Unreal Editor`) -
  see the note under "Status" above.

## Not implemented (v1)

- No automatic refresh. Use **Refresh**.
- No reordering within a column. A dropped card always goes to the end.
- No editing of assignees or tags. Tags are shown but not editable.
- The description is edited as raw Markdown. There is no rendered preview.
