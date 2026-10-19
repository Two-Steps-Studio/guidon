# Guidon for Unity

> See [`../../CONVENTIONS.md`](../../CONVENTIONS.md) for the terminology/login-flow standard every Guidon plugin follows.

One package, two parts:

| Part | Folder | Ships in your game? |
|---|---|---|
| **Board, Moodboard, Reports filter** - a Kanban board for a Guidon project inside the Unity Editor: view, create, edit, drag-and-drop between columns, delete, add subtasks to, and comment on tasks; the project's moodboard; the board narrowed to bug reports | `Editor/` (asmdef `GuidonTasks.Editor`, Editor only) | No |
| **In-game reporter** - players or testers press a key and a Guidon task is created with a screenshot, the log and build details | `Runtime/` (asmdef `Guidon.Reports`) | Yes, but it does nothing until `Resources/GuidonReportsSettings` exists |

**Upgrading from the separate `GuidonTasks` and `GuidonReports` folders**:
delete both, then copy `Guidon` in. Your `GuidonReportsSettings` asset lives
in your own `Resources` folder, so it stays; EditorPrefs (login, Base URL)
stay too. Unity reports duplicate assemblies while an old folder is still
there.

## The board (Editor)

The `Editor/` folder is restricted to `"includePlatforms": ["Editor"]`, so it
never ships inside a player build - no API key or task data can end up in a
game your players run.

Built on Unity's **UI Toolkit** (`CreateGUI`/`VisualElement`), not the
older `OnGUI`/IMGUI - the first version used IMGUI and looked like flat
grey boxes with no way to fix that (IMGUI has no real per-element styling
API); UI Toolkit actually supports background colors, rounded corners, and
spacing. Colors and corner radii (`GuidonStyles.cs`) are copied verbatim
from the web app's own design tokens (`src/app/globals.css`) and its
Kanban board's Tailwind classes, not eyeballed - both a dark and a light
palette, matched to whichever Unity Editor skin you're using. Text fields
and dropdowns are reskinned to match the site's own Input/Select look too
(transparent background, a bordered rounded-md box, a label stacked above
the field instead of Unity's default inline "Label: [box]"), and buttons
follow the site's variants - solid accent for the primary action
(Log In/Save/Create), a neutral outline for secondary actions
(Refresh/Log Out/Cancel/Close), red for Delete. The main board window also
carries the Guidon icon and a link back to the website in its header. Each
column has the same colored status dot the site shows next to its
name (Backlog grey, Todo/AI Working blue, In Progress amber, Review
accent, Done green - copied from `BOARD_COLUMNS`' own `accentClass`, not
invented), and a card now shows its tags as small pills and its subtask
progress (e.g. "✓ 2/5") the same way the site's card does - the one thing
the card still can't show is a comment count, since the task-list API
doesn't return one and fetching it per card would mean one extra request
per visible task. It's still not going to be pixel-identical to the
website - Editor windows render with Unity's own fonts and window chrome
regardless - but the board's colors, shapes, icons, and now its controls
are the real ones.

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

1. **Install**: copy the whole `Guidon` folder into your Unity project,
   anywhere under `Assets/` (e.g. `Assets/Guidon`), or let Guidon Desktop's
   plugin installer put it there.
2. In Unity, open **Window → Guidon → Tasks**. Expand **Settings**, set
   **Base URL** to your Guidon instance (e.g. `https://useguidon.com` or
   `http://localhost:5803` for a local dev server), then click **Log In**.
   Your browser opens to a Guidon page asking you to approve the plugin -
   approve it, and the Unity window picks up the result automatically
   (usually within a second or two of clicking Authorize).

   The resulting API key is stored in `EditorPrefs` (machine-wide, not
   inside your Unity project) so it never risks being committed to your
   project's own git repo - the trade-off is that it's shared across every
   Unity project you open on this machine, not scoped to just this one.
   **Log Out** just clears it locally; it does not revoke the key
   server-side (logging back in reissues a fresh one either way).
3. Pick a project from the dropdown in the toolbar. Its board loads -
   click a card to open it (title, description, priority, due date,
   status, subtasks, comments - all editable), drag a card to another
   column to change its status, or click a column's **+** to create a task
   straight into it.

### If the browser can't reach Unity

The local listener tries ports 51820-51829 and gives up with a clear error
if none are free - close any other in-progress Guidon login (Unity or
otherwise) and try again. A corporate firewall or antivirus that blocks
local loopback listeners would also prevent this from completing; there is
no fallback path in v1 if that's the case for your machine.

## Board columns

The board shows the project's own columns: the labels, order and hidden
columns set in the web app's project settings, loaded from
`GET /api/v1/projects/{id}/columns`. The status list offers only visible
columns. Against an older Guidon without that endpoint, the plugin falls
back to the six default columns.

## Known limitation: status changes can 403

Logging in through the plugin issues a key marked `human_client` (the same
flag a regular website session gets), so it does **not** go through a
project's **AI Permissions** gate (`can_change_status`, Allow AI
Auto-Complete, `can_complete_tasks`) - those only apply to keys issued to AI
agents. A 403 on a status change instead means your account's role on this
project isn't **Owner**, **Admin** or **Developer** (task status updates are
restricted to those three roles at the database level). Check
Project Settings → Members, or ask the project owner to change your role.

If a status change 403s, the plugin shows the server's own error message
verbatim.

## Git reference

**Copy Git ref** in the task window copies `guidon#1a2b3c4d`. Put it in a
commit message, PR title or branch name and, with the GitHub integration on
(see `docs/configuration.md`, `GITHUB_APP_WEBHOOK_SECRET`), the task gets a
link and moves by itself: a commit starts it, a PR sends it to Review, and a
merge into the default branch marks it Done.

## Auto-refresh

The board reloads itself every 30 seconds while Unity is the application in
front, and the task window reloads its comments on the same cadence. It
stays quiet - no "Loading" flash, no error banner - and only redraws when
something changed; a reload that overlaps your own drag or save is thrown
away. Turn it off with **Settings → Auto-refresh every 30 s** (stored in
EditorPrefs like the rest of the settings).

## Moodboard

**Window → Guidon → Moodboard** (or **Moodboard** in the Tasks window's
toolbar) shows the project's reference images and concept art - Knowledge →
Moodboard on the website - as a thumbnail grid, with tag filters and a
search field. Click an image to see it large; from there **Open source**
follows its link and **Save to Assets** copies it into
`Assets/Guidon References/` (named after its caption) and pings it in the
Project window. Until you save one, images stay in memory only. Unity's
`Texture2D.LoadImage` reads PNG and JPEG; other formats are listed as
unavailable. Adding images stays on the website (**Open in Browser**).

Checked: the Editor scripts compile with no warnings against the Unity
2022.3 and Unity 6 (6000.0) editor assemblies. The window itself hasn't been
opened in a running editor yet.

## Description formatting

A task's description supports the common Markdown subset - **bold**,
*italic*, `` `inline code` ``, `#`/`##` headers, `-`/`*` bullet lists, and
`[text](url)` links (rendered as coloured text with the URL shown after it
in parentheses - Unity's rich text has no per-substring click handling, so
links aren't clickable here the way they are on the web). Click **Preview**
next to the Description field to render it, **Edit** to go back to the raw
Markdown source. This is a small hand-written converter to Unity's
built-in rich-text tags, not a full Markdown parser (no tables, code
blocks, or nested lists) - the web app's own description preview
(react-markdown) is the complete implementation; this one covers what's
realistically useful in a task description viewed at Editor-window width.

## Not implemented (v1)

- No within-column reordering by drag position - dropping a card into a
  column always places it at the end of that column, even if you dropped
  it visually near the top.
- No assignee or tags editing (viewing/editing covers title, description,
  priority, status, and due date).
- Unreal Engine 5, Godot, Blender, JetBrains IDEs and VS Code have their own plugins: [`plugins/unreal`](../../unreal/Guidon/README.md), [`plugins/godot`](../../godot/README.md), [`plugins/blender`](../../blender/README.md), [`plugins/jetbrains`](../../jetbrains/README.md) and [`plugins/vscode`](../../vscode/README.md). Each gets its own API key name, so logging into one never logs another out.

## A note on drag-and-drop

Drag-and-drop (`GuidonTasksWindow.cs`) is built on UI Toolkit's pointer
events (`PointerDownEvent`/`PointerMoveEvent`/`PointerUpEvent`) with
pointer capture and `panel.Pick()` to resolve the column under the cursor -
the API this problem actually calls for, and more robust than the first
IMGUI version's manual Rect-containment checks. Still hand-rolled
application logic rather than a built-in "drag this card" control, so if a
drag ever behaves oddly (a card not picking up, a drop landing in the
wrong column, a status not actually changing after a successful-looking
drop), that's the most likely place for a bug - please report exactly
which column, which card, and what happened instead of the expected move.

## In-game reports (Runtime)

In-game bug reports straight into Guidon. A player or tester presses **F8**
(configurable) and the game pauses to show a small form. **Send** creates a
Backlog task titled `[Bug] …` / `[Crash] …` / `[Feedback] …`, labelled
`in-game`, with:

- a **screenshot** (JPEG) taken just before the form appeared,
- the **recent log** (the last 300 lines by default, with stack traces for
  errors),
- a table of **details**: build version, Unity version, platform, OS, device,
  GPU, memory, scene, resolution, FPS and play time, plus anything your game
  adds.

### Setup

1. In **Window → Guidon → Tasks**, click **Reports** in the toolbar. The
   board then shows only bug reports - from the game and from the website's
   widget - and **All Tasks** switches back.
2. Click **Set Up In-Game Reports**. That creates a report key for the open
   project (you need the owner, admin or developer role there) and writes it,
   with the Base URL and project, into `Assets/Resources/GuidonReportsSettings`
   - or into the existing `GuidonReportsSettings` asset if you have one in any
   `Resources` folder. **Send Reports Here** appears when the game reports
   into a different project.

That's all: the reporter starts itself before the first scene loads. You
don't add anything to a scene.

By hand instead: on the website, **Profile → API Keys**, create a key with
**only** the `reports:write` scope, then **Assets → Create → Guidon → Report
Settings**, put the asset in a `Resources` folder named
`GuidonReportsSettings` and fill in **Base Url**, **Project Id** (the id in
the project's URL, `/projects/<id>/…`) and **Report Key**.

> **The report key ships inside your build.** Treat it as public. That's why
> it must have only `reports:write`: that scope can file reports and nothing
> else. It can't read, change or delete anything, and the server enforces
> this. If it leaks and gets abused, revoke it on the website and ship a new
> one.

By default the reporter runs only in the **Editor and development builds**.
Turn on **Enabled In Release Builds** for public playtests or early access.
**Auto Report Exceptions** files a `crash` report automatically on an
unhandled exception: at most one per minute, and one per distinct message per
session.

### From your code

```csharp
using Guidon.Reports;

// Add your own details to every report:
GuidonReporter.CollectMetadata += m => m["player_position"] = player.transform.position.ToString();

// Open the built-in form (e.g. from a pause-menu button):
GuidonReporter.Open();

// Or send from your own UI:
GuidonReporter.Submit("Door clips through wall", "Details…", "bug",
    captureScreenshot: true, done: (ok, message) => Debug.Log(message));
```

The form is IMGUI on purpose. It needs no UI package, Canvas, EventSystem or
Input System setting, so it can't clash with your game's own UI. The hotkey
is read from IMGUI key events for the same reason. Requests go through
`UnityWebRequest`, so there are no dependencies. On WebGL the Guidon server
would also have to allow your game's origin (CORS).

### Verified

- The runtime part compiles with no errors against Unity 2021.3's engine
  reference assemblies (mono `mcs`). It has **not** been run inside the
  Unity player.
- Merged package: `Runtime/` and `Editor/` (which now references
  `Guidon.Reports` for the setup button) compiled with mono `mcs` against
  the Unity 2021.1 reference assemblies; the new code adds no errors
  (the only ones are API differences in that older reference set that the
  previous code had too). The Reports filter and **Set Up In-Game Reports**
  haven't been clicked in a running Editor; the server route behind the
  button was tested against a real local Guidon.
- The server side it talks to was tested end to end against a real local
  Guidon: attachments stored, the metadata table, rejection of bad files,
  and a report key that can't read or change anything.
