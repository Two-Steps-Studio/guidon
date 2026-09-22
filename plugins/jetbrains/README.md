# Guidon Tasks for JetBrains IDEs

A Kanban board for a Guidon project in a tool window of **any IntelliJ-based
IDE**: IntelliJ IDEA, Rider, WebStorm, PyCharm, CLion, GoLand, PhpStorm,
RubyMine, RustRover and Android Studio. The plugin depends only on
`com.intellij.modules.platform`, so one build covers all of them. You can view,
create, edit, drag cards between columns, delete, add subtasks to and comment
on tasks. It's the JetBrains counterpart of the
[Unity plugin](../unity/GuidonTasks/README.md) and uses the same public API
(`/api/v1`, see [the API's README](../../src/app/api/v1/README.md)).

## Build and install

Requires JDK 17+ (21 recommended) and network access to Maven Central and
JetBrains' repositories.

```bash
cd plugins/jetbrains
./gradlew buildPlugin      # -> build/distributions/guidon-tasks-jetbrains-1.0.0.zip
./gradlew runIde           # optional: a sandbox IDE with the plugin loaded
```

Install the zip through **Settings → Plugins → ⚙ → Install Plugin from Disk…**.
It targets 2024.3 (build 243) and newer, with no upper limit.

## Use

1. Open the **Guidon** tool window (bottom bar, or **View → Tool Windows →
   Guidon**).
2. Check the **Base URL** (`https://useguidon.com`, or `http://localhost:2137`
   for a local dev server) and click **Log In**. Your browser opens the Guidon
   website. Click **Authorize** and the tool window picks up the key
   automatically.
3. Pick a project in the toolbar. Then:
   - Click a card to open it in the details panel on the right. There you
     edit the title, priority, due date (`YYYY-MM-DD`) and the Markdown
     description, then click **Save**.
   - **Status** in the details panel applies right away. You can also drag a
     card onto another column; it lands at the end of that column.
   - **+** on a column opens an inline title field. **Enter** creates the
     task, **Esc** cancels.
   - Subtasks: the checkbox toggles done/todo, the field below adds one with
     Enter, and a click opens it.
   - Comments: write a comment and click **Post**.
   - **Copy ID** copies the task id, e.g. for a commit message or branch name.

The board's colors come from the web app's design tokens, as light/dark pairs
(`JBColor`), so the board follows the IDE theme. Everything else, such as
fields, buttons and dropdowns, uses the IDE's own look.

## Login and storage

Login uses the same loopback flow as the Unity plugin. The JDK's built-in HTTP
server binds `127.0.0.1` on the first free port in 51820-51829. The browser goes
to `/auth/plugin-login?client=jetbrains` and is redirected back with a freshly
issued key. The plugin never sees your password. Waiting times out after
5 minutes, and **Cancel** stops it sooner.

The key goes into the **IDE's password safe** (the OS keychain by default,
**Settings → Appearance & Behavior → System Settings → Passwords**), never into
`.idea/`, so it can't be committed to your repo. The password safe is only read
and written off the UI thread. The base URL, email and last project are
application-level IDE properties, shared by every project you open. The key is
listed on the website as **"JetBrains Plugin"** under **Profile → API Keys**,
separate from the Unity, Unreal and Blender keys. **Log Out** removes it from
the password safe but doesn't revoke it on the server; revoke it on the website
if you lose a machine.

HTTP goes through `java.net.http` and JSON through Gson, which ships with the
IntelliJ Platform, so the plugin bundles no extra libraries.

## How it was verified

The IntelliJ Platform SDK couldn't be downloaded where this was written, so
`./gradlew buildPlugin` has **not** been run. What was done instead:

- All plugin sources were compiled with Kotlin 2.1 against small stubs of the
  handful of platform APIs they use: `ApplicationManager`, `PasswordSafe`,
  `PropertiesComponent`, `BrowserUtil`, `Messages`, `JBColor`, `JBUI`,
  `ToolWindowFactory` and `ContentFactory`.
- Against a fake Guidon server, tests exercised the API client (parsing
  including JSON nulls, 401/403/unreachable server/bad URL), the full loopback
  login (key, email, `client=jetbrains`, cancel, timeout, browser failure) and
  the board ordering rules.
- The real tool-window panel was driven under Xvfb in both a dark and a light
  theme: login, opening a card, **dragging cards between columns with the
  mouse**, a refused status change being reverted, subtasks, comments, editing
  and saving, inline creation, delete, switching projects and log out.

The remaining risk is a mismatch between the stubs and the real platform API
signatures, which would show up as a compile error on the first
`./gradlew buildPlugin`.

## Not implemented (v1)

- No automatic refresh. Use **Refresh**.
- No reordering within a column; a dropped card always goes to the end.
- No editing of assignees or tags (tags are shown but not editable).
- The description is edited as raw Markdown, with no rendered preview.
