# Guidon for Godot

> See [`../CONVENTIONS.md`](../CONVENTIONS.md) for the terminology/login-flow standard every Guidon plugin follows.

One add-on for **Godot 4.2+**: copy `addons/guidon` into your project's
`addons/` and enable **Guidon** in **Project → Project Settings → Plugins**.
It adds a "Guidon" bottom panel with your board, the project's moodboard and
its bug reports, and - once you set reports up - an in-game reporter.

| Part | What it is | Ships in your game? |
|---|---|---|
| Board, Moodboard, Reports filter | The "Guidon" bottom panel | No, editor only |
| In-game reporter (`reporter.gd`) | Players/testers press a key, a Guidon task is created | Yes, as the `GuidonReporter` autoload - added only when you set reports up |

**Upgrading from 1.x** (the separate `guidon_tasks` and `guidon_reports`
add-ons): disable both, delete their folders, copy `addons/guidon` in and
enable it. Your report settings are kept (same `guidon_reports/*` keys), and
an existing `GuidonReporter` autoload is pointed at the new folder
automatically. The editor warns while an old folder is still there.

## Board (editor)

The Godot counterpart of the Unity, Unreal, Blender and JetBrains plugins,
using the same public API (`/api/v1`).

- **Log In** opens the Guidon website in your browser. Approve the plugin
  there and the panel picks up the key. It uses the same loopback flow as the
  other plugins: `127.0.0.1`, ports 51820-51829, `/auth/plugin-login?client=godot`.
  The key is stored in the **Editor Settings** (per user, outside the project,
  so it can't be committed) and appears on the website as **"Godot Plugin"**.
- The board shows the project's own columns: labels, colours, order and
  hidden columns from the project settings, including custom columns (a
  custom column can count as done, which the subtask checkboxes follow).
  Priorities come from the project too, most important first, with their
  labels and colours on the cards and in the priority picker. A priority the
  project no longer lists still shows, labelled with its key, in grey.
  Against an older server it falls back to the six default columns and the
  four built-in priorities.
- Click a card to edit it on the right, **drag it onto another column** to
  change its status, and use **+** on a column to create a task there (Enter
  creates, Esc cancels). The details panel also has subtasks (checkbox =
  done), comments, delete and **Copy Git ref** (`guidon#1a2b3c4d`). Put it in a
  commit, PR or branch name, and the GitHub integration links and moves the
  task.
- **Auto-refresh** (toolbar checkbox, on by default) reloads the board and
  the open task's comments every 30 seconds while the panel is visible. It
  waits while you drag a card or type in one of the panel's fields, and a
  reload that overlaps your own change is dropped.
- **Moodboard** in the toolbar swaps the board for the project's reference
  images and concept art (Knowledge → Moodboard on the website): a grid of
  thumbnails with tag filters and search; click one to see it large, with
  **Open source** for its link. **Board** switches back. Images are decoded
  in memory (PNG, JPEG, WebP, BMP) - nothing is written into your project.
  Adding images stays on the website (**Open in Browser**).
- The panel uses the website's colors (`src/app/globals.css`), with a light or
  dark set that follows the editor theme.

## In-game reports

Press **F9** (configurable) in a running game. The game pauses and a small
form asks what happened. **Send** creates a Backlog task titled
`[Bug] …` / `[Crash] …` / `[Feedback] …`, labelled `in-game`, with:

- a **screenshot** taken just before the form appeared,
- the tail of Godot's own **log** file (`user://logs/godot.log`),
- a table of **details**: game version, Godot version, OS, GPU, memory, scene,
  resolution, FPS and play time, plus anything your game adds.

### Setup

In the Guidon panel, click **Reports** (the board then shows only bug
reports - from the game and from the website's widget - and **All Tasks**
switches back), then **Set Up In-Game Reports**. That creates a report key
for the open project, saves it with the server and project in **Project
Settings → General → Guidon Reports** (turn on *Advanced Settings*), and adds
the `GuidonReporter` autoload. You need the owner, admin or developer role in
the project. **Send Reports Here** appears when the game reports into a
different project.

By hand instead: on the website, **Profile → API Keys**, create a key with
**only** the `reports:write` scope, and fill in **Base Url**, **Project Id**
(the id in the project's URL, `/projects/<id>/…`) and **Report Key** in
those Project Settings, then add `res://addons/guidon/reporter.gd` as the
`GuidonReporter` autoload.

> **The report key ships inside your game** (it's in `project.godot`). Treat
> it as public. That's why it must have only `reports:write`: that scope can
> file reports and nothing else. It can't read, change or delete anything,
> and the server enforces this. If it leaks and gets abused, revoke it on the
> website and ship a new one.

The reporter runs in **debug builds** only, unless you turn on
**Enabled In Release** (e.g. for a public playtest or early access).

### From your code

```gdscript
# Add your own details to every report:
GuidonReporter.collect_metadata.connect(func(m): m["player_position"] = str(player.global_position))

# Open the built-in form (e.g. from a pause-menu button):
GuidonReporter.open()

# Or send from your own UI:
var result = await GuidonReporter.submit("Door clips through wall", "Details…", "bug")
if result.ok: print("sent")
```

### Verified

Run in **Godot 4.3** against a real local Guidon instance
(Next.js + PostgreSQL 16, every migration applied).

- **Tasks:** the headless editor loads the add-on without errors. Tested:
  real browser login (a scripted browser clicked Authorize), custom
  columns, click-to-open, drag-and-drop with real mouse events, create,
  subtasks, comments, edit and save, date validation, delete and log out.
- **Moodboard** (added later): parses and loads with the panel in the
  editor (checked with the 2.0 merge); showing real images in Godot hasn't
  been run yet.
- **Reports:** F9 opened the form and paused the game. Tested: sending from
  the form and via `submit()`, the screenshot and log arriving as task
  attachments, and custom metadata showing up in the task.
- **2.0 merge** (one add-on): the headless editor loads it without errors
  and keeps settings at their defaults out of `project.godot`; a project
  with the 1.x autoload gets it repointed and the old-folder warning. A
  scripted run against a real server: **Reports** narrowed the board to the
  report tasks, **Set Up In-Game Reports** created a project-bound key and
  saved it, and `GuidonReporter.submit()` with those settings filed a report
  that then showed up under **Reports**. The panel was rendered (OpenGL,
  Xvfb) to check the reports bar's layout. Not run by hand in the editor UI.
