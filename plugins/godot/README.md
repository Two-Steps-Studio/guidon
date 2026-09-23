# Guidon for Godot

Two independent add-ons for **Godot 4.2+**. Copy either folder, or both,
into your project's `addons/` and enable it in **Project → Project Settings →
Plugins**.

| Add-on | What it is | Ships in your game? |
|---|---|---|
| [`guidon_tasks`](addons/guidon_tasks) | Your Guidon board in the editor: a "Guidon" bottom panel | No, editor only |
| [`guidon_reports`](addons/guidon_reports) | In-game bug reports: players/testers press a key, a Guidon task is created | Yes, as an autoload |

## Guidon Tasks (editor)

The Godot counterpart of the Unity, Unreal, Blender and JetBrains plugins,
using the same public API (`/api/v1`).

- **Log In** opens the Guidon website in your browser. Approve the plugin
  there and the panel picks up the key. It uses the same loopback flow as the
  other plugins: `127.0.0.1`, ports 51820-51829, `/auth/plugin-login?client=godot`.
  The key is stored in the **Editor Settings** (per user, outside the project,
  so it can't be committed) and appears on the website as **"Godot Plugin"**.
- The board shows the project's own columns: labels, order and hidden columns
  from the project settings. Against an older server it falls back to the six
  default columns.
- Click a card to edit it on the right, **drag it onto another column** to
  change its status, and use **+** on a column to create a task there (Enter
  creates, Esc cancels). The details panel also has subtasks (checkbox =
  done), comments, delete and **Copy Git ref** (`guidon#1a2b3c4d`). Put it in a
  commit, PR or branch name, and the GitHub integration links and moves the
  task.
- The panel uses the website's colors (`src/app/globals.css`), with a light or
  dark set that follows the editor theme.

## Guidon Reports (in-game)

Press **F9** (configurable) in a running game. The game pauses and a small
form asks what happened. **Send** creates a Backlog task titled
`[Bug] …` / `[Crash] …` / `[Feedback] …`, labelled `in-game`, with:

- a **screenshot** taken just before the form appeared,
- the tail of Godot's own **log** file (`user://logs/godot.log`),
- a table of **details**: game version, Godot version, OS, GPU, memory, scene,
  resolution, FPS and play time, plus anything your game adds.

### Setup

1. On the Guidon website, go to **Profile → API Keys** and create a key with
   **only** the `reports:write` scope. It must be created by someone who is
   an owner, admin or developer of the project.
2. Enable the add-on. In **Project Settings → General → Guidon Reports**
   (turn on *Advanced Settings*), fill in **Base Url**, **Project Id** (the id
   in the project's URL, `/projects/<id>/…`) and **Report Key**.

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

Both add-ons were run in **Godot 4.3** against a real local Guidon instance
(Next.js + PostgreSQL 16, every migration applied).

- **Tasks:** the headless editor loads the add-on without errors. Tested:
  real browser login (a scripted browser clicked Authorize), custom
  columns, click-to-open, drag-and-drop with real mouse events, create,
  subtasks, comments, edit and save, date validation, delete and log out.
- **Reports:** F9 opened the form and paused the game. Tested: sending from
  the form and via `submit()`, the screenshot and log arriving as task
  attachments, and custom metadata showing up in the task.
