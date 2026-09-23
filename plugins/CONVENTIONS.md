# Guidon plugin conventions

Read this before building a new Guidon editor/IDE plugin (or touching an existing one). It exists so someone switching from one Guidon plugin to another gets the same feel of use, even though each plugin is written in a different language against a different host's UI toolkit (C# + UI Toolkit for Unity, C++ + Slate for Unreal, Python + `bpy` panels for Blender, GDScript for Godot, Kotlin + Swing/Compose for JetBrains, TypeScript + a webview for VS Code).

Audited directly against the real source of all six existing plugins on 2026-09-23 (not just their READMEs) - the terminology below is already consistent across all of them today, confirmed by grepping the actual UI string literals, not assumed from prose descriptions. **The bar for a new plugin, or an edit to an existing one, is to keep it that way.**

## Terminology (must match exactly, case included)

| Concept | Exact label |
|---|---|
| Sign in | **Log In** |
| Sign out | **Log Out** |
| Server address setting | **Base URL** |
| Reload the board from the server | **Refresh** |
| Copy `guidon#<id>` for a commit/PR/branch | **Copy Git ref** |

These five are the ones a user actually reads and compares between plugins in normal use. Get these exactly right; don't invent a synonym ("Sign In", "Server URL", "Sync") even if it reads more naturally in isolation - the point is recognition on sight, not local elegance.

**Accepted exception, not a bug:** a genuinely space-constrained context (Blender's narrow N-panel sidebar is the current example: `text="URL"` instead of "Base URL", `text="Git Ref"` instead of "Copy Git ref", both in `plugins/blender/guidon_tasks/panels.py`) may shorten a label where the full text would wrap or clip in a real, narrow layout. The underlying setting/operator keeps the full canonical name internally (Blender's own `StringProperty(name="Base URL", ...)` and the operator's `bl_label = "Copy Git Ref"` both do) - only the on-screen rendering in that one cramped spot is shortened. Do not "fix" an abbreviation like this into the full label without actually running the host application and confirming the longer text still fits; a cosmetic-only change that can't be verified and risks a real layout regression is a bad trade.

## Login flow (already identical across all six - keep new plugins on this exact flow)

Every plugin uses the same loopback pattern, the one well-known CLI tools (`gh auth login`, `gcloud auth login`) use:

1. Bind a local HTTP listener on `127.0.0.1`, first free port in `51820`-`51829`.
2. Open the system browser to `{BaseUrl}/auth/plugin-login?redirect_uri=http://localhost:{port}/callback&state={random}&client={plugin-name}` (the `client` query param - `unity`, `unreal`, `blender`, `godot`, `jetbrains`, `vscode` - is what makes each plugin's key show up under its own name on the website; use your new plugin's own lowercase name here, don't reuse an existing one).
3. Wait (non-blockingly - never freeze the host application's UI thread) up to 5 minutes for the callback carrying `apiKey`/`email`/`state`; verify `state` matches.
4. Store the key using whatever secure, per-user (not per-project/workspace) mechanism the host platform actually offers - `EditorPrefs` (Unity), `GConfig`/`Editor.ini` (Unreal), Blender's user preferences, Godot's Editor Settings, the IDE's password safe (JetBrains), VS Code's `SecretStorage`. Never write it into a project file, `.blend`, `.uproject`, workspace `settings.json`, or anything else that could end up committed to a user's own repo.
5. **Log Out** clears the key locally only - it does not revoke the key server-side. State this plainly in the plugin's own README, same as every existing plugin does, so a user who loses a machine knows to revoke it manually from **Profile → API Keys** on the website instead of assuming Log Out handled that.

No server-side change is ever needed to add a new plugin's login flow: `src/app/auth/plugin-login/loopback.ts`'s `isSafeLoopbackRedirect` only requires the redirect target to be `localhost`/`127.0.0.1` - it has no per-plugin allowlist.

## Board columns

Load the project's own configured columns via `GET /api/v1/projects/{id}/columns` (labels, order, hidden columns) rather than hardcoding the six default statuses. Fall back to the six defaults only if that endpoint 404s (an older self-hosted Guidon instance without it).

## Interaction patterns that are ALLOWED to differ per platform

These are legitimate platform-native variation, not inconsistency to standardize away - forcing pixel-identical behavior here would fight each host's own idioms for no real user benefit:

- **How a new task is created** ("+" on a column): an inline title-only field with Enter-to-create/Esc-to-cancel (Unreal, Godot, JetBrains, VS Code) is the lighter, faster pattern and the current majority; a native modal/props dialog asking for title+description+priority+due-date up front (Blender's `invoke_props_dialog`, Unity's separate "New Task" window) is heavier but gives more capability at creation time. Both are fine. Pick whichever fits your host's own idiom for "prompt the user for a few fields" - don't force a window-based host toolkit into faking an inline field, or vice versa.
- **How drag-and-drop is implemented** (or its absence): Unity/Unreal/Godot/JetBrains/VS Code support dragging a card to another column; Blender explicitly doesn't (panels can't take a custom drag payload) and uses ◀/▶ move buttons plus a status dropdown instead. This is a real, stated platform limitation, not a gap to close by hacking around Blender's panel system.
- **Exact color rendering**: every plugin uses the same underlying design tokens (`src/app/globals.css`), light/dark-aware where the host has a theme concept, but the actual widget classes (Slate `FSlateStyleSet`, UI Toolkit `USS`-equivalent inline styles, `JBColor`, Blender's own color-tag icons, CSS custom properties) are whatever’s native to that host.

## Verification

State plainly, in the plugin's own README, whether it was actually run in the real host application or not (several of these plugins were written without that host's toolchain installed in the environment that built them - Unreal, JetBrains, and VS Code all say so explicitly today). Never claim "verified" language that overstates what was actually checked. If you can't compile/run it, say exactly what you did check instead (type-checking against stubs, a scripted-browser + real-server integration test, etc.) and name the specific remaining risk, matching the existing plugins' own "How it was verified" sections.
