# Guidon Tasks for Blender

A Guidon project board in Blender's sidebar. You can view, create, edit,
move between columns, delete, add subtasks to and comment on tasks without
leaving Blender. It's the Blender counterpart of the
[Unity plugin](../unity/GuidonTasks/README.md) and talks to the same
public API (`/api/v1`, see [the API's README](../../src/app/api/v1/README.md)).

## Install

**Blender 4.2 or newer (extension):** zip the `guidon_tasks` folder (the
zip must contain `guidon_tasks/blender_manifest.toml`), then open
**Edit → Preferences → Get Extensions → ⌄ → Install from Disk...** and pick
the zip.

**Blender 3.6 to 4.1 (legacy add-on):** the same zip goes through
**Edit → Preferences → Add-ons → Install...** instead. Enable **Guidon Tasks**
afterwards.

Blender 4.2+ blocks network access for all extensions until you allow it:
**Preferences → System → Network → Allow Online Access**. The panel tells
you if it's off.

## Use

1. In the 3D Viewport press **N** and open the **Guidon** tab. The same panels
   are also in the Text Editor's sidebar.
2. Check the **URL** (default `https://useguidon.com`; `http://localhost:2137`
   for a local dev server) and click **Log In**. Your browser opens the real
   Guidon login and consent page. Click **Authorize** there and Blender picks
   up the key within a second or so.
3. Pick a project. Each board column is a collapsible box. Click a task to
   open it in the **Task** panel below.

In the Task panel:

- **◀ / ▶** move the task to the previous or next column. The status dropdown
  jumps to any column. A moved task lands at the end of its new column, the
  same as dropping a card on the web board.
- **Edit** changes the title, priority and due date (`YYYY-MM-DD`).
- **Description:** Blender has no multi-line text field in panels, so
  **Edit in Text Editor** copies the description (Markdown) into a text block
  named `Guidon <id>.md` and shows it in an open Text Editor. Edit it there
  and click **Save** to send it back. The text block is part of the current
  .blend file, so delete it if you don't want the description saved with
  your scene.
- **Subtasks:** the checkbox toggles done/todo and **+** adds one. Clicking a
  subtask opens it, and **Back to Parent** returns to its parent.
- **Comments:** type a comment and click **Post**.
- **Git Ref** copies `guidon#1a2b3c4d`. Put it in a commit, PR or branch name,
  and the GitHub integration links and moves the task.

Blender panels can't take custom colors, so the website's colored status and
priority dots are shown with Blender's built-in color-tag icons.

## Board columns

The board shows the project's own columns: the labels, order and hidden
columns set in the web app's project settings, loaded from
`GET /api/v1/projects/{id}/columns`. The status list offers only visible
columns. Against an older Guidon without that endpoint, the plugin falls
back to the six default columns.

## Login and storage

Login uses the same loopback flow as the Unity plugin. A listener on
`127.0.0.1` (ports 51820-51829) waits up to 5 minutes for the browser to
come back from `/auth/plugin-login?client=blender`. The add-on never sees
your password.

The key is stored in Blender's **user preferences**, never in a .blend
file, so it can't be shared along with a scene. It is machine-wide and
shows up on the website as **Profile → API Keys → "Blender Plugin"**,
separate from the Unity and Unreal keys. Logging in again replaces only the
Blender key. **Log Out** clears the key locally but doesn't revoke it on the
server. Revoke it on the website if you lose a machine.

## Design notes

- Network calls run on a worker thread (`jobs.py`) and results are applied on
  the main thread through `bpy.app.timers`. A slow server never freezes
  Blender, and bpy is never touched off the main thread.
- `api.py` and `auth.py` use only the standard library (`urllib`,
  `http.server`) and don't import bpy, so no pip dependencies are needed.
- Status changes follow the project's permission rules. When the server
  refuses a change, its error message is shown at the top of the panel.

## Not implemented (v1)

- No drag-and-drop: Blender panels don't support dragging custom items, so
  the arrows and the status dropdown replace it. For the same reason there's
  no reordering within a column.
- No automatic refresh. Use the refresh button.
- No editing of assignees or tags.
