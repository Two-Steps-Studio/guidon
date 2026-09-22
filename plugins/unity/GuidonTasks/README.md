# Guidon Tasks for Unity

A Kanban board for a Guidon project right inside the Unity Editor - view,
create, edit, drag-and-drop between columns, delete, add subtasks to, and
comment on tasks without leaving Unity.

## What this is (and isn't)

This is an Editor-only tool (`Editor/` folder + an asmdef restricted to
`"includePlatforms": ["Editor"]`), so it never ships inside a player
build - no API key or task data can end up in a game your players run.

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

- No background auto-refresh - use the **Refresh** button. An always-on
  poll while the window sits unfocused isn't worth the editor overhead for
  a "glance at it" tool.
- No within-column reordering by drag position - dropping a card into a
  column always places it at the end of that column, even if you dropped
  it visually near the top.
- No assignee or tags editing (viewing/editing covers title, description,
  priority, status, and due date).
- Unreal Engine 5 and Blender have their own plugins: [`plugins/unreal`](../../unreal/GuidonTasks/README.md) and [`plugins/blender`](../../blender/README.md). Each gets its own API key name, so logging into one never logs another out.

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
