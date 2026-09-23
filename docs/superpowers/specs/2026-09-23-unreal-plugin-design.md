# Unreal Engine 5.7 plugin (GuidonTasks)

**Status:** approved by user (2026-09-23). Architecture confirmed directly: C++ plugin with Slate UI, full feature parity with the existing Unity plugin (`plugins/unity/GuidonTasks/`).

## Known limitation (stated up front, not discovered later)

**No Unreal Engine installation exists in this development environment** (checked: no `UnrealEditor` binary, no `UE_5.*` install directory under Epic Games' install locations - only the launcher/redist infrastructure is present). Every other feature built this session (task attachments, the Discord bot, the MCP endpoint) had a real compile-and-run verification pass; this one cannot. The plugin will be written carefully against Unreal Engine 5.7's documented, stable public APIs (`FHttpModule`, `FJsonObjectConverter`, `Slate`/`SlateCore` widgets, `FHttpServerModule`), cross-referenced against real, known-correct UE code patterns rather than guessed, but it has **not been compiled**. The user will need to open it in a real UE 5.7 project, compile it, and report back any compiler errors or runtime issues for a follow-up fix pass - this is expected, not a sign the work wasn't done carefully.

## What exists already (the reference implementation)

`plugins/unity/GuidonTasks/Editor/` (~2435 lines of C#) - a Unity Editor-only plugin:
- `GuidonSettings.cs` - `EditorPrefs`-backed base URL / API key / email / last-project-id, machine-wide not per-project (deliberately, so the key never lands in the user's project repo).
- `GuidonModels.cs` - DTOs matching the Guidon API's JSON verbatim (snake_case), `TaskDto`/`ProjectDto`/`CommentDto`, request bodies (`CreateTaskBody`, `UpdateTaskFieldsBody`, `UpdateSortOrderBody`, `StatusPatchBody`, `CommentPostBody`), and `GuidonVocabulary` (hand-mirrored status/priority lists from `src/lib/work/task-board.ts`).
- `GuidonApiClient.cs` - thin wrapper over `/api/v1/*`, one method per call (`ListProjects`, `ListTasks`, `CreateTask`, `UpdateTaskFields`, `UpdateSortOrder`, `SetTaskStatus`, `DeleteTask`, `ListComments`, `AddComment`), every call returns `GuidonResult<T>{Ok, Value, Error}` and never throws.
- `GuidonBrowserAuth.cs` - loopback login: opens `{baseUrl}/auth/plugin-login?redirect_uri=http://localhost:{port}/callback&state={guid}` in the system browser, listens locally for the callback carrying `apiKey`/`email`, verifies the `state` nonce.
- `GuidonMarkdown.cs` - hand-rolled Markdown subset (bold/italic/inline code/headers/bullet lists/links-as-styled-text) rendered as native rich text.
- `GuidonSortOrder.cs` - midpoint sort-order math for drag-and-drop reordering, mirroring `task-board.ts`'s `sortOrderForPosition`.
- `GuidonStyles.cs`, `GuidonLogo.cs` - visuals matched to the real site (colors, shapes, logo), not a guess.
- `GuidonTasksWindow.cs` - the Kanban board: drag-and-drop cards between columns, CRUD, subtasks, Refresh button.
- `GuidonTaskDetailWindow.cs` - task detail popup: title, description edit/preview, priority/status/due-date, subtasks, comments.

**Server-side confirmation:** `src/app/auth/plugin-login/loopback.ts`'s `isSafeLoopbackRedirect` only requires the `redirect_uri` to be `http://localhost` or `http://127.0.0.1` - nothing Unity-specific. **No server-side changes are needed for this plugin at all**; the exact same `/auth/plugin-login` flow works unmodified from any client that can open a system browser and listen on a local port.

## Architecture

An Editor-only C++ plugin at `plugins/unreal/GuidonTasks/`, mirroring `plugins/unity/`'s location convention:

```
plugins/unreal/GuidonTasks/
  GuidonTasks.uplugin
  Source/GuidonTasks/
    GuidonTasks.Build.cs
    Public/
      GuidonSettings.h
      GuidonModels.h
      GuidonApiClient.h
      GuidonBrowserAuth.h
      GuidonMarkdown.h
      GuidonSortOrder.h
      GuidonStyles.h
      SGuidonTaskCard.h
      SGuidonTasksWindow.h
      SGuidonTaskDetailWindow.h
      GuidonTasksModule.h
    Private/
      GuidonSettings.cpp
      GuidonModels.cpp
      GuidonApiClient.cpp
      GuidonBrowserAuth.cpp
      GuidonMarkdown.cpp
      GuidonSortOrder.cpp
      GuidonStyles.cpp
      SGuidonTaskCard.cpp
      SGuidonTasksWindow.cpp
      SGuidonTaskDetailWindow.cpp
      GuidonTasksModule.cpp
  README.md
```

`GuidonTasks.uplugin`: `"Type": "Editor"` (never loaded in packaged/shipped games, matching Unity's `Editor/` folder convention), minimum engine version `5.7`, module `LoadingPhase: "PostEngineInit"`.

`GuidonTasks.Build.cs` dependencies: `Core`, `CoreUObject`, `Engine`, `Slate`, `SlateCore`, `EditorStyle`/`ToolMenus`, `HTTP`, `Json`, `JsonUtilities`, `HTTPServer`. All built-in engine modules - zero third-party plugin dependencies, matching Unity's "ships with the platform" choice.

### Module-by-module mapping to the Unity reference

| Unity file | UE equivalent | Key difference |
|---|---|---|
| `GuidonSettings.cs` | `GuidonSettings.h/.cpp` | `EditorPrefs` → plain `GConfig->GetString`/`SetString` calls against `GEditorSettingsIni` (the engine-wide `Editor.ini`, not a per-project ini) under a `[GuidonTasks]` section - this is UE's actual machine-wide-not-per-project settings store, matching Unity's `EditorPrefs` choice exactly, not just an approximation of it |
| `GuidonModels.cs` | `GuidonModels.h` | Plain C++ structs with `USTRUCT()`/`UPROPERTY()` reflection, (de)serialized via `FJsonObjectConverter::JsonObjectToUStruct`/`UStructToJsonObject` instead of `JsonUtility` |
| `GuidonApiClient.cs` | `GuidonApiClient.h/.cpp` | `async`/`await` on `Task<GuidonResult<T>>` → `FHttpModule`'s inherently callback-based `FHttpRequestCompleteDelegate`, exposed as `void ListTasks(FString ProjectId, TFunction<void(FGuidonResult<TArray<FGuidonTask>>)> OnComplete)`. Same never-throws contract, same `FGuidonResult<T>{bool bOk; T Value; FString Error}` |
| `GuidonBrowserAuth.cs` | `GuidonBrowserAuth.h/.cpp` | `HttpListener` → `FHttpServerModule::Get().GetHttpRouter(Port)`'s `BindRoute`, `Application.OpenURL` → `FPlatformProcess::LaunchURL`. Same state-nonce verification |
| `GuidonMarkdown.cs` | `GuidonMarkdown.h/.cpp` | Native rich text tags → a small parser building a `TSharedRef<SWidget>` (a `SRichTextBlock` with a custom `FTextBlockStyle` decorator set, or nested `SHorizontalBox`/`STextBlock` runs) for the same subset: bold/italic/inline code/headers/bullet lists/links-as-styled-text (not clickable, same as Unity) |
| `GuidonSortOrder.cs` | `GuidonSortOrder.h/.cpp` | Direct port - pure float midpoint math, no engine-specific API involved |
| `GuidonStyles.cs`, `GuidonLogo.cs` | `GuidonStyles.h/.cpp` | `GUIStyle`/`EditorGUIUtility` → an `FSlateStyleSet` registered in the module's `StartupModule()`, brushes/colors matching the same site palette Unity's version already sampled |
| `GuidonTasksWindow.cs` | `SGuidonTasksWindow.h/.cpp` | IMGUI/UI-Toolkit hand-rolled pointer tracking → Slate's native `FDragDropOperation`/`OnDragDetected`/`OnDrop` on each `SGuidonTaskCard`, which is a *better* fit than what Unity had to hand-roll |
| `GuidonTaskDetailWindow.cs` | `SGuidonTaskDetailWindow.h/.cpp` | A second `SDockTab` (or a modal `SWindow`) with the same field set |

### Login flow

1. `SGuidonTasksWindow`'s "Log in" button calls `GuidonBrowserAuth::LoginAsync`.
2. It starts an `FHttpServerModule` router on the first free port in `51820-51829` (same range as Unity, arbitrary but consistent), binds `GET /callback`.
3. Opens `{BaseUrl}/auth/plugin-login?redirect_uri=http://localhost:{port}/callback&state={guid}` via `FPlatformProcess::LaunchURL`.
4. On the callback request, extracts `apiKey`/`email`/`state` from the query string, verifies `state`, responds with a small static HTML page ("Logged in - you can close this tab"), stops the router.
5. Stores `ApiKey`/`Email` via `GuidonSettings`, same as Unity.

Same 5-minute timeout as Unity (a `FTSTicker`-driven or `FPlatformProcess::Sleep`-free async timeout via a delegate + timer handle, not a blocking wait - UE's editor must stay responsive).

### UI

`SGuidonTasksWindow` (registered as a nomad tab spawner under `Window > Guidon Tasks`):
- Top bar: base URL / logged-in-as-email / Log out button (when configured), a project dropdown (`SComboBox<TSharedPtr<FGuidonProject>>`), a Refresh button.
- Board body: `SScrollBox` (horizontal) of column `SVerticalBox`es (one per `GuidonVocabulary::Statuses` entry), each an `SScrollBox` (vertical) of `SGuidonTaskCard` widgets.
- `SGuidonTaskCard`: title, priority-colored accent, due date if set, subtask count, implements `OnDragDetected` (creates an `FGuidonTaskDragDropOp` carrying the task id) and the column container implements `OnDrop` (computes new `sort_order` via `GuidonSortOrder`, calls `GuidonApiClient::UpdateSortOrder` and/or `SetTaskStatus` if the column changed, optimistically updates local state, reconciles on the async response).
- A "+" button per column opens a small inline creation row (title text box + Enter-to-submit), calling `CreateTask`.
- Clicking a card opens `SGuidonTaskDetailWindow` for that task.

`SGuidonTaskDetailWindow`: title (editable `SEditableTextBox`), description (`SMultiLineEditableTextBox` in edit mode / `GuidonMarkdown`-rendered in preview mode, toggled by a Preview/Edit button exactly like Unity), priority (`SComboBox`), status (`SComboBox`), due date (a simple `SEditableTextBox` parsing `YYYY-MM-DD`, matching Unity's own text-field approach rather than pulling in a calendar widget dependency), subtask list (read-only list + "add subtask" row calling `CreateTask` with `parent_task_id` set), comments (list + add-comment row).

### Non-goals (matching Unity's own v1 list)

No background auto-refresh (manual Refresh button only). No within-column reorder beyond whatever drop-position falls out of the drag-and-drop math. No assignee/tags editing. No Unreal-specific extras (e.g. no in-viewport gizmos, no runtime/packaged-game usage - Editor-only, same as Unity).

## Testing

No UE installation is available to compile against in this environment (see "Known limitation" above). Verification consists of:
1. Careful, direct cross-referencing of every UE API call against its real, documented signature (not guessed) - `FHttpModule`, `FJsonObjectConverter`, `FHttpServerModule`, and the specific Slate widget APIs (`SDragAndDrop`/`FDragDropOperation`, `SScrollBox`, `SComboBox`) used.
2. A written manual verification checklist (mirroring the Unity plugin's own implicit manual-testing process) for the user to run through once they compile the plugin in a real UE 5.7 project: log in, see projects/tasks, drag a card between columns, create/edit/delete a task, add a subtask, add a comment, log out.
3. `npx tsc --noEmit` / `npm run test:db` are NOT relevant here (no Next.js/DB code touched) - this plan does not modify anything under `src/` or `src/db/`.

Because compilation cannot be verified locally, expect a follow-up fix round once the user compiles this against a real UE 5.7 project and reports any errors - this is the expected and planned-for outcome of building without a compiler available, not a quality shortfall to hide.
