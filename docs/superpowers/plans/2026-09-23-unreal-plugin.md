# Unreal Engine 5.7 Plugin (GuidonTasks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the existing Unity Editor plugin (`plugins/unity/GuidonTasks/`) to a new Unreal Engine 5.7 Editor-only C++ plugin at `plugins/unreal/GuidonTasks/`, with the same feature set: browser-based login, a Kanban board with drag-and-drop, task CRUD, subtasks, Markdown description editing, comments.

**Architecture:** A C++ `Editor`-type UE plugin using only built-in engine modules (`HTTP`, `Json`/`JsonUtilities`, `HTTPServer`, `Slate`/`SlateCore`) - zero third-party dependencies, mirroring the Unity plugin's "ships with the platform" choice. No server-side changes: `src/app/auth/plugin-login/loopback.ts`'s `isSafeLoopbackRedirect` only requires a `localhost`/`127.0.0.1` redirect, which this plugin's own local `HTTPServer`-based listener satisfies exactly like Unity's `HttpListener` does.

**Tech Stack:** Unreal Engine 5.7, C++17, Slate UI framework, UE's built-in HTTP/JSON/HTTPServer modules.

**CRITICAL CONSTRAINT - read before starting any task:** No Unreal Engine installation exists in this development environment (confirmed: no `UnrealEditor` binary, no `UE_5.*` directory under Epic Games' install locations). **Nothing in this plan can be compiled.** Every task's "verify" step is a manual cross-check of real UE 5.7 API signatures (cited against known, stable, documented APIs - `FHttpModule`, `FJsonObjectConverter`, `FHttpServerModule`, Slate's `SLATE_BEGIN_ARGS` widget-declaration pattern), not a build/run step. Do not attempt to run `UnrealBuildTool`, `Build.bat`, or any UE CLI - it is not installed and the attempt will just fail with "command not found," wasting a step. The final task produces a written manual-test checklist for the user to run once they compile this in a real UE 5.7 project.

**Reference implementation:** `plugins/unity/GuidonTasks/Editor/*.cs` - read the relevant file before writing its UE equivalent in each task below; this plan tells you which file maps to which, but the exact field names/behavior nuances are worth re-confirming against the real Unity source since it's the ground truth for what "feature parity" means here.

---

### Task 1: Plugin scaffolding

**Files:**
- Create: `plugins/unreal/GuidonTasks/GuidonTasks.uplugin`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/GuidonTasks.Build.cs`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonTasksModule.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonTasksModule.cpp`

- [ ] **Step 1: Write the `.uplugin` descriptor**

```json
{
	"FileVersion": 3,
	"Version": 1,
	"VersionName": "1.0",
	"FriendlyName": "Guidon Tasks",
	"Description": "View and manage Guidon project tasks from inside the Unreal Editor - login, Kanban board, task CRUD, subtasks, comments.",
	"Category": "Productivity",
	"CreatedBy": "Guidon",
	"CanContainContent": false,
	"Installed": false,
	"EngineVersion": "5.7.0",
	"Modules": [
		{
			"Name": "GuidonTasks",
			"Type": "Editor",
			"LoadingPhase": "PostEngineInit"
		}
	]
}
```

`"Type": "Editor"` means this module is never loaded in a packaged/shipped game - only in the Editor, matching the Unity plugin's `Editor/` folder convention exactly. `"CanContainContent": false` because this plugin has no `Content/` assets (no Blueprints, no `.uasset` files) - it's pure C++ and Slate, same "no extra baggage" spirit as the Unity plugin having zero package dependencies.

- [ ] **Step 2: Write the module's Build.cs**

```csharp
using UnrealBuildTool;

public class GuidonTasks : ModuleRules
{
	public GuidonTasks(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(
			new string[]
			{
				"Core",
				"CoreUObject",
				"Engine",
			}
		);

		PrivateDependencyModuleNames.AddRange(
			new string[]
			{
				"Slate",
				"SlateCore",
				"UnrealEd",
				"ToolMenus",
				"EditorStyle",
				"HTTP",
				"Json",
				"JsonUtilities",
				"HTTPServer",
				"Projects",
			}
		);
	}
}
```

`UnrealEd` and `ToolMenus`/`EditorStyle` are needed for registering a tab spawner under the `Window` menu (Task 12) - every UE Editor-tool plugin that adds a dockable window depends on these. `HTTP`/`Json`/`JsonUtilities`/`HTTPServer` map directly to the Unity plugin's `UnityWebRequest`/`JsonUtility`/`HttpListener` usage. `Projects` is needed for `IPluginManager` if the module ever needs its own plugin's base directory (used later for loading the logo image in Task 8).

- [ ] **Step 3: Write the module's header**

```cpp
// GuidonTasksModule.h
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FGuidonTasksModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	void RegisterMenus();
	void OnTasksWindowTabClosed(const TSharedRef<class SDockTab>& ClosedTab);

	TSharedPtr<class FUICommandList> PluginCommands;

	static const FName TasksTabName;
};
```

- [ ] **Step 4: Write a minimal module implementation (tab spawning comes in Task 12 - for now, just prove the module loads)**

```cpp
// GuidonTasksModule.cpp
#include "GuidonTasksModule.h"
#include "Modules/ModuleManager.h"

const FName FGuidonTasksModule::TasksTabName(TEXT("GuidonTasks"));

void FGuidonTasksModule::StartupModule()
{
	UE_LOG(LogTemp, Log, TEXT("GuidonTasks module started."));
}

void FGuidonTasksModule::ShutdownModule()
{
}

void FGuidonTasksModule::RegisterMenus()
{
	// Implemented in Task 12, once SGuidonTasksWindow exists to spawn.
}

void FGuidonTasksModule::OnTasksWindowTabClosed(const TSharedRef<class SDockTab>& ClosedTab)
{
	// Implemented in Task 12.
}

IMPLEMENT_MODULE(FGuidonTasksModule, GuidonTasks)
```

- [ ] **Step 5: Self-check (no compiler available - manual verification instead)**

Confirm against a known-good reference: `.uplugin` `"FileVersion": 3` and the `Modules` array shape match the format UE 5.x has used since 4.27 (unchanged in 5.7) - cross-check against any other `.uplugin` file you may have seen in training data with `"Type": "Editor"` and `"LoadingPhase": "PostEngineInit"`, both standard, well-documented values (the other valid `LoadingPhase` values are `Default`, `PreDefault`, `PostDefault`, `PreLoadingScreen`, `PostConfigInit`, `EarliestPossible`; `PostEngineInit` is correct for a UI-registering Editor plugin that needs `FGlobalTabmanager` to already exist, which it does not yet by `PreDefault`/`Default`). `IMPLEMENT_MODULE` macro signature `(ModuleImplClass, ModuleName)` is unchanged since UE4 and stable in 5.7.

- [ ] **Step 6: Commit**

```bash
git add plugins/unreal/GuidonTasks/GuidonTasks.uplugin plugins/unreal/GuidonTasks/Source/GuidonTasks/GuidonTasks.Build.cs plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonTasksModule.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonTasksModule.cpp
git commit -m "Scaffold GuidonTasks Unreal Engine plugin module"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 2: GuidonModels (data types + JSON conversion)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonModels.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonModels.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonModels.cs` in full - every field name below must match it verbatim (they're the API's real snake_case JSON field names).

- [ ] **Step 1: Write the header - USTRUCTs for every DTO**

```cpp
// GuidonModels.h
#pragma once

#include "CoreMinimal.h"
#include "GuidonModels.generated.h"

USTRUCT()
struct FGuidonProject
{
	GENERATED_BODY()

	UPROPERTY()
	FString id;

	UPROPERTY()
	FString name;

	UPROPERTY()
	FString organization_id;
};

USTRUCT()
struct FGuidonTask
{
	GENERATED_BODY()

	UPROPERTY()
	FString id;

	UPROPERTY()
	FString project_id;

	UPROPERTY()
	FString title;

	UPROPERTY()
	FString description;

	UPROPERTY()
	FString status;

	UPROPERTY()
	FString priority;

	UPROPERTY()
	TArray<FString> tags;

	UPROPERTY()
	FString due_date;

	UPROPERTY()
	int32 progress_percent = 0;

	// float, not int: the web app's sortOrderForPosition (task-board.ts) does
	// midpoint insertion ((before+after)/2), so real rows routinely have
	// fractional values - matches GuidonModels.cs's own TaskDto.sort_order comment.
	UPROPERTY()
	float sort_order = 0.f;

	UPROPERTY()
	FString parent_task_id;

	UPROPERTY()
	FString created_at;

	UPROPERTY()
	FString updated_at;
};

USTRUCT()
struct FGuidonComment
{
	GENERATED_BODY()

	UPROPERTY()
	FString id;

	UPROPERTY()
	FString task_id;

	UPROPERTY()
	FString author_id;

	UPROPERTY()
	FString content;

	UPROPERTY()
	FString created_at;

	UPROPERTY()
	FString actor_label;
};

/** Result of GuidonBrowserAuth's loopback login - apiKey/email read from the callback's query string. */
USTRUCT()
struct FGuidonLoginResult
{
	GENERATED_BODY()

	UPROPERTY()
	FString ApiKey;

	UPROPERTY()
	FString Email;
};

// ---- Wrapper response shapes (every /api/v1 response is an object, never a bare array - confirmed against src/app/api/v1/**/route.ts, same as GuidonModels.cs's own comment) ----

USTRUCT()
struct FGuidonProjectsResponse
{
	GENERATED_BODY()

	UPROPERTY()
	TArray<FGuidonProject> projects;
};

USTRUCT()
struct FGuidonTasksResponse
{
	GENERATED_BODY()

	UPROPERTY()
	TArray<FGuidonTask> tasks;
};

USTRUCT()
struct FGuidonTaskResponse
{
	GENERATED_BODY()

	UPROPERTY()
	FGuidonTask task;
};

USTRUCT()
struct FGuidonCommentsResponse
{
	GENERATED_BODY()

	UPROPERTY()
	TArray<FGuidonComment> comments;
};

USTRUCT()
struct FGuidonCommentResponse
{
	GENERATED_BODY()

	UPROPERTY()
	FGuidonComment comment;
};

USTRUCT()
struct FGuidonErrorResponse
{
	GENERATED_BODY()

	UPROPERTY()
	FString error;
};

// ---- Request bodies ----

USTRUCT()
struct FGuidonStatusPatchBody
{
	GENERATED_BODY()

	UPROPERTY()
	FString status;
};

USTRUCT()
struct FGuidonCommentPostBody
{
	GENERATED_BODY()

	UPROPERTY()
	FString content;
};

/** Body for POST /api/v1/projects/{id}/tasks. Matches CreateTaskBody in GuidonModels.cs field-for-field. */
USTRUCT()
struct FGuidonCreateTaskBody
{
	GENERATED_BODY()

	UPROPERTY()
	FString title;

	UPROPERTY()
	FString description;

	UPROPERTY()
	FString priority;

	UPROPERTY()
	FString due_date;

	UPROPERTY()
	FString parent_task_id;

	/** Ignored server-side for a subtask (always forced to "todo") - only meaningful for a top-level task. */
	UPROPERTY()
	FString status;
};

/** Body for PATCH /api/v1/tasks/{id} from the detail window's Save button - always sends all four fields together. */
USTRUCT()
struct FGuidonUpdateTaskFieldsBody
{
	GENERATED_BODY()

	UPROPERTY()
	FString title;

	UPROPERTY()
	FString description;

	UPROPERTY()
	FString priority;

	UPROPERTY()
	FString due_date;
};

/** Body for the drag-and-drop reorder commit - a separate type from FGuidonUpdateTaskFieldsBody so only sort_order gets serialized. */
USTRUCT()
struct FGuidonUpdateSortOrderBody
{
	GENERATED_BODY()

	UPROPERTY()
	float sort_order = 0.f;
};

/**
 * Guidon's task vocabulary, mirrored by hand from src/lib/work/task-board.ts
 * (BOARD_COLUMNS / TASK_PRIORITIES) - same manual-sync-point caveat as
 * GuidonVocabulary in the Unity plugin's GuidonModels.cs.
 */
namespace GuidonVocabulary
{
	extern const TArray<FString> Statuses;
	extern const TArray<FString> StatusLabels;
	extern const TArray<FString> Priorities;

	FString StatusLabel(const FString& Status);
}
```

- [ ] **Step 2: Write the implementation - just the vocabulary helper (the USTRUCTs above need no .cpp logic, `GENERATED_BODY()` handles their reflection)**

```cpp
// GuidonModels.cpp
#include "GuidonModels.h"

namespace GuidonVocabulary
{
	const TArray<FString> Statuses = { TEXT("backlog"), TEXT("todo"), TEXT("in_progress"), TEXT("ai_working"), TEXT("review"), TEXT("done") };
	const TArray<FString> StatusLabels = { TEXT("Backlog"), TEXT("Todo"), TEXT("In Progress"), TEXT("AI Working"), TEXT("Review"), TEXT("Done") };
	const TArray<FString> Priorities = { TEXT("low"), TEXT("medium"), TEXT("high"), TEXT("critical") };

	FString StatusLabel(const FString& Status)
	{
		int32 Index = Statuses.IndexOfByKey(Status);
		return Statuses.IsValidIndex(Index) ? StatusLabels[Index] : Status;
	}
}
```

- [ ] **Step 3: Self-check**

`USTRUCT()`/`UPROPERTY()`/`GENERATED_BODY()` requires the `.generated.h` include to be the LAST include in the file (UnrealHeaderTool convention, unchanged since UE4 and still required in 5.7) - confirmed `#include "GuidonModels.generated.h"` is the final line of the includes block above. `FJsonObjectConverter::JsonObjectToUStruct`/`UStructToJsonObject` (used in Task 3) work with any `USTRUCT()` reflected type and match field names case-sensitively by default, which is why every field above is written in the API's real snake_case rather than UE's usual PascalCase convention - deliberately, same reasoning as the Unity plugin's own comment about not using idiomatic C# casing. `TArray<FString> tags` and `TArray<FGuidonProject> projects` etc. are supported directly by `FJsonObjectConverter` for arrays of both primitives and reflected structs - no special-casing needed.

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonModels.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonModels.cpp
git commit -m "Add GuidonModels: USTRUCT DTOs matching the Guidon API's JSON verbatim"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 3: GuidonSettings (persisted config)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonSettings.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonSettings.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonSettings.cs` - the four stored values (BaseUrl, ApiKey, Email, ProjectId), the `IsConfigured` derived property, and the `LogOut()` behavior (clears ApiKey/Email locally, does NOT revoke server-side) must all be preserved.

- [ ] **Step 1: Write the header**

```cpp
// GuidonSettings.h
#pragma once

#include "CoreMinimal.h"

/**
 * Machine-wide settings for the Guidon Tasks window, backed by GConfig
 * against GEditorSettingsIni (the engine-wide Editor.ini, not a per-project
 * ini) - deliberately, so the API key can never end up committed to the
 * user's own UE project repo, and matches Unity's EditorPrefs choice
 * exactly: the key is shared across every UE project on this machine, not
 * scoped per-project.
 */
class GuidonSettings
{
public:
	static FString GetBaseUrl();
	static void SetBaseUrl(const FString& Value);

	/**
	 * The API key obtained by logging in via the browser (GuidonBrowserAuth) -
	 * this plugin never asks for or stores a password. Never rendered back in
	 * the UI once set; only "Logged in as {Email}" is shown.
	 */
	static FString GetApiKey();
	static void SetApiKey(const FString& Value);

	/** Display-only - the email of whoever last logged in, for the "Logged in as" line. */
	static FString GetEmail();
	static void SetEmail(const FString& Value);

	/** Last-selected Guidon project id, restored on window reopen. */
	static FString GetProjectId();
	static void SetProjectId(const FString& Value);

	static bool IsConfigured();

	/**
	 * Clears the locally-stored key/email. Doesn't revoke the key
	 * server-side (Profile > API Keys still shows "Unreal Plugin" as
	 * active) - logging back in reissues one anyway, same reasoning as the
	 * Unity plugin's own LogOut() comment.
	 */
	static void LogOut();

private:
	static const TCHAR* SectionName;
	static const TCHAR* BaseUrlKey;
	static const TCHAR* ApiKeyKey;
	static const TCHAR* EmailKey;
	static const TCHAR* ProjectIdKey;
};
```

- [ ] **Step 2: Write the implementation**

```cpp
// GuidonSettings.cpp
#include "GuidonSettings.h"
#include "Misc/ConfigCacheIni.h"

const TCHAR* GuidonSettings::SectionName = TEXT("GuidonTasks");
const TCHAR* GuidonSettings::BaseUrlKey = TEXT("BaseUrl");
const TCHAR* GuidonSettings::ApiKeyKey = TEXT("ApiKey");
const TCHAR* GuidonSettings::EmailKey = TEXT("Email");
const TCHAR* GuidonSettings::ProjectIdKey = TEXT("ProjectId");

FString GuidonSettings::GetBaseUrl()
{
	FString Value;
	if (GConfig->GetString(SectionName, BaseUrlKey, Value, GEditorSettingsIni) && !Value.IsEmpty())
	{
		return Value;
	}
	return TEXT("https://useguidon.com");
}

void GuidonSettings::SetBaseUrl(const FString& Value)
{
	GConfig->SetString(SectionName, BaseUrlKey, *Value, GEditorSettingsIni);
	GConfig->Flush(false, GEditorSettingsIni);
}

FString GuidonSettings::GetApiKey()
{
	FString Value;
	GConfig->GetString(SectionName, ApiKeyKey, Value, GEditorSettingsIni);
	return Value;
}

void GuidonSettings::SetApiKey(const FString& Value)
{
	GConfig->SetString(SectionName, ApiKeyKey, *Value, GEditorSettingsIni);
	GConfig->Flush(false, GEditorSettingsIni);
}

FString GuidonSettings::GetEmail()
{
	FString Value;
	GConfig->GetString(SectionName, EmailKey, Value, GEditorSettingsIni);
	return Value;
}

void GuidonSettings::SetEmail(const FString& Value)
{
	GConfig->SetString(SectionName, EmailKey, *Value, GEditorSettingsIni);
	GConfig->Flush(false, GEditorSettingsIni);
}

FString GuidonSettings::GetProjectId()
{
	FString Value;
	GConfig->GetString(SectionName, ProjectIdKey, Value, GEditorSettingsIni);
	return Value;
}

void GuidonSettings::SetProjectId(const FString& Value)
{
	GConfig->SetString(SectionName, ProjectIdKey, *Value, GEditorSettingsIni);
	GConfig->Flush(false, GEditorSettingsIni);
}

bool GuidonSettings::IsConfigured()
{
	return !GetApiKey().IsEmpty() && !GetBaseUrl().IsEmpty();
}

void GuidonSettings::LogOut()
{
	SetApiKey(TEXT(""));
	SetEmail(TEXT(""));
}
```

- [ ] **Step 3: Self-check**

`GConfig` is a globally available `FConfigCacheIni*` in every UE module (declared in `Misc/ConfigCacheIni.h`, defined by the engine at startup) - no initialization needed by this plugin. `GEditorSettingsIni` is a real, stable global `FString` (defined in `UnrealEd`, pointing at `Editor.ini` under the engine's saved-config directory, NOT the per-project `Saved/Config/.../EditorPerProjectUserSettings.ini`) - this is what makes the setting machine-wide rather than per-project, matching the spec's stated requirement. `GConfig->GetString`/`SetString`/`Flush` signatures (`Section`, `Key`, `Value`, `Filename`) are unchanged since UE4.

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonSettings.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonSettings.cpp
git commit -m "Add GuidonSettings: GConfig-backed machine-wide plugin settings"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 4: GuidonSortOrder (drag-and-drop position math)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonSortOrder.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonSortOrder.cpp`

This is a direct, mechanical port of the REAL algorithm in `plugins/unity/GuidonTasks/Editor/GuidonSortOrder.cs` (already read in full - reproduced exactly below, not reconstructed from a description): it takes the whole destination column plus the id of the task being moved (filtering that task out internally, so the caller doesn't have to pre-exclude it), the target 0-based index, computes `before`/`after` neighbor `sort_order` values from the filtered list, returns `1000` for an empty column, `neighbor ± 100` at either end, the exact midpoint in the middle, and falls back to `before + 100` if the midpoint doesn't land strictly between its neighbors (guards the same degenerate-float-precision case the TypeScript original's `Number.isFinite` check does).

- [ ] **Step 1: Write the header**

```cpp
// GuidonSortOrder.h
#pragma once

#include "CoreMinimal.h"
#include "GuidonModels.h"

/**
 * Computes the sort_order value for a task dropped at a given position
 * within a column, by midpoint insertion between its new neighbors - a
 * direct port of GuidonSortOrder.cs, which itself mirrors the web app's
 * sortOrderForPosition (src/lib/work/task-board.ts). Pure math, no engine
 * API involved.
 */
namespace GuidonSortOrder
{
	/**
	 * @param Column        The destination column's full task list (any
	 *        order) - the moving task is filtered out internally by id, so
	 *        callers don't need to pre-exclude it.
	 * @param Index         The 0-based position the task should land at
	 *        among the OTHER tasks in that column (i.e. after filtering
	 *        MovingTaskId out).
	 * @param MovingTaskId  The id of the task being placed - excluded from
	 *        its own neighbor computation even if it's already in Column
	 *        (e.g. reordering within the same column it started in).
	 */
	float ForPosition(const TArray<FGuidonTask>& Column, int32 Index, const FString& MovingTaskId);
}
```

- [ ] **Step 2: Write the implementation**

```cpp
// GuidonSortOrder.cpp
#include "GuidonSortOrder.h"

namespace GuidonSortOrder
{
	float ForPosition(const TArray<FGuidonTask>& Column, int32 Index, const FString& MovingTaskId)
	{
		TArray<FGuidonTask> Siblings;
		Siblings.Reserve(Column.Num());
		for (const FGuidonTask& Task : Column)
		{
			if (Task.id != MovingTaskId)
			{
				Siblings.Add(Task);
			}
		}

		TOptional<float> Before;
		if (Index - 1 >= 0 && Index - 1 < Siblings.Num())
		{
			Before = Siblings[Index - 1].sort_order;
		}

		TOptional<float> After;
		if (Index >= 0 && Index < Siblings.Num())
		{
			After = Siblings[Index].sort_order;
		}

		if (!Before.IsSet() && !After.IsSet())
		{
			return 1000.f;
		}
		if (!Before.IsSet())
		{
			return After.GetValue() - 100.f;
		}
		if (!After.IsSet())
		{
			return Before.GetValue() + 100.f;
		}

		const float Midpoint = (Before.GetValue() + After.GetValue()) / 2.f;
		// Guards the same edge case the TS version's Number.isFinite check
		// does (two neighbors only fractionally apart) - if the midpoint
		// doesn't land strictly between them, fall back to appending after
		// `Before` instead of a value that would sort wrong or collide.
		return (Midpoint > Before.GetValue() && Midpoint < After.GetValue()) ? Midpoint : Before.GetValue() + 100.f;
	}
}
```

- [ ] **Step 3: Self-check**

Line-by-line comparison against the real `GuidonSortOrder.cs` (reproduced in this task's intro): same filter-by-id step, same `before`/`after` index bounds checks, same three early-return cases (`1000f` / `after - 100f` / `before + 100f`), same midpoint-validity guard with the same `before + 100f` fallback. `TOptional<float>` is UE's `Nullable<float>` equivalent (`IsSet()`/`GetValue()`), the correct type here since `float sort_order` has no sentinel "no value" representation of its own - matches the C# version's `float?`.

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonSortOrder.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonSortOrder.cpp
git commit -m "Add GuidonSortOrder: drag-and-drop midpoint sort_order math"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 5: GuidonApiClient (HTTP wrapper over `/api/v1`)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonApiClient.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonApiClient.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonApiClient.cs` in full - every one of its 9 public methods (`ListProjects`, `ListTasks`, `SetTaskStatus`, `ListComments`, `AddComment`, `CreateTask`, `UpdateTaskFields`, `UpdateSortOrder`, `DeleteTask`) needs a UE equivalent below with the same URL path, HTTP verb, and request body shape. The one real architectural difference: C#'s `async`/`await` becomes UE's inherently callback-based `FHttpModule` API - every method here takes a `TFunction<void(FGuidonResult<T>)> OnComplete` instead of returning an awaitable `Task<GuidonResult<T>>`. Same never-throws contract as Unity's version: every failure mode (network error, non-2xx response, malformed JSON, not logged in) reaches `OnComplete` as `FGuidonResult<T>::Failure(...)`, never a C++ exception.

- [ ] **Step 1: Write the header**

```cpp
// GuidonApiClient.h
#pragma once

#include "CoreMinimal.h"
#include "GuidonModels.h"

/** Every call site gets this back instead of a thrown exception/errno - mirrors GuidonResult<T> in the Unity plugin. */
template <typename T>
struct FGuidonResult
{
	bool bOk = false;
	T Value{};
	FString Error;

	static FGuidonResult<T> Success(T InValue)
	{
		FGuidonResult<T> Result;
		Result.bOk = true;
		Result.Value = MoveTemp(InValue);
		return Result;
	}

	static FGuidonResult<T> Failure(FString InError)
	{
		FGuidonResult<T> Result;
		Result.bOk = false;
		Result.Error = MoveTemp(InError);
		return Result;
	}
};

/**
 * Thin wrapper over Guidon's /api/v1 for the same calls the Unity plugin's
 * GuidonApiClient.cs makes. Built on UE's own FHttpModule + JsonUtilities -
 * zero extra plugin dependency, the idiomatic choice for Editor tooling,
 * same reasoning as Unity's own UnityWebRequest + JsonUtility choice.
 */
namespace GuidonApiClient
{
	void ListProjects(TFunction<void(FGuidonResult<TArray<FGuidonProject>>)> OnComplete);

	void ListTasks(const FString& ProjectId, TFunction<void(FGuidonResult<TArray<FGuidonTask>>)> OnComplete);

	void SetTaskStatus(const FString& TaskId, const FString& Status, TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete);

	void ListComments(const FString& TaskId, TFunction<void(FGuidonResult<TArray<FGuidonComment>>)> OnComplete);

	void AddComment(const FString& TaskId, const FString& Content, TFunction<void(FGuidonResult<FGuidonComment>)> OnComplete);

	/**
	 * @param ParentTaskId  Empty creates a top-level task; a real task id creates a subtask of it.
	 * @param Status        Only meaningful for a top-level task (which column it's created into,
	 *                      defaults server-side to "backlog" if empty). Ignored for a subtask.
	 */
	void CreateTask(
		const FString& ProjectId,
		const FString& Title,
		const FString& Description,
		const FString& Priority,
		const FString& DueDateIso,
		const FString& ParentTaskId,
		const FString& Status,
		TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete);

	void UpdateTaskFields(
		const FString& TaskId,
		const FString& Title,
		const FString& Description,
		const FString& Priority,
		const FString& DueDateIso,
		TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete);

	/** Commits a drag-and-drop reorder - only sort_order, nothing else on the task changes. */
	void UpdateSortOrder(const FString& TaskId, float SortOrder, TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete);

	void DeleteTask(const FString& TaskId, TFunction<void(FGuidonResult<bool>)> OnComplete);
}
```

- [ ] **Step 2: Write the implementation**

```cpp
// GuidonApiClient.cpp
#include "GuidonApiClient.h"
#include "GuidonSettings.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "JsonObjectConverter.h"

namespace GuidonApiClient
{
	static TOptional<FString> ExtractServerError(const FString& Body)
	{
		if (Body.IsEmpty())
		{
			return TOptional<FString>();
		}

		FGuidonErrorResponse ErrorResponse;
		if (FJsonObjectConverter::JsonObjectStringToUStruct<FGuidonErrorResponse>(Body, &ErrorResponse, 0, 0) && !ErrorResponse.error.IsEmpty())
		{
			return ErrorResponse.error;
		}
		return TOptional<FString>();
	}

	/**
	 * Never invokes OnComplete with a thrown exception - GuidonTasksWindow's
	 * Slate callbacks (button OnClicked, drag-and-drop OnDrop) have nowhere
	 * useful to catch one, same reasoning as the Unity client's own SendAsync
	 * doc comment. Every failure mode reaches OnComplete as a Failure result.
	 */
	static void SendAsync(const FString& Method, const FString& Path, const TOptional<FString>& JsonBody, TFunction<void(FGuidonResult<FString>)> OnComplete)
	{
		if (!GuidonSettings::IsConfigured())
		{
			OnComplete(FGuidonResult<FString>::Failure(TEXT("Log in from the Guidon Tasks window first.")));
			return;
		}

		FString Url = GuidonSettings::GetBaseUrl();
		Url.RemoveFromEnd(TEXT("/"));
		Url += Path;

		TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
		Request->SetURL(Url);
		Request->SetVerb(Method);
		Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + GuidonSettings::GetApiKey());

		if (JsonBody.IsSet())
		{
			Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
			Request->SetContentAsString(JsonBody.GetValue());
		}

		Request->OnProcessRequestComplete().BindLambda(
			[OnComplete](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnectedSuccessfully)
			{
				if (!bConnectedSuccessfully || !Response.IsValid())
				{
					OnComplete(FGuidonResult<FString>::Failure(TEXT("Request failed: could not connect.")));
					return;
				}

				const int32 Code = Response->GetResponseCode();
				const FString Body = Response->GetContentAsString();

				if (!EHttpResponseCodes::IsOk(Code))
				{
					TOptional<FString> ServerError = ExtractServerError(Body);
					const FString Message = ServerError.IsSet() ? ServerError.GetValue() : Response->GetContentType();
					OnComplete(FGuidonResult<FString>::Failure(FString::Printf(TEXT("%d %s"), Code, *Message)));
					return;
				}

				OnComplete(FGuidonResult<FString>::Success(Body));
			});

		if (!Request->ProcessRequest())
		{
			OnComplete(FGuidonResult<FString>::Failure(TEXT("Request failed: could not start.")));
		}
	}

	template <typename TResponse, typename TInner, typename TExtract>
	static void ParseWrapped(const FGuidonResult<FString>& Raw, const TCHAR* Context, TExtract Extract, TFunction<void(FGuidonResult<TInner>)> OnComplete)
	{
		if (!Raw.bOk)
		{
			OnComplete(FGuidonResult<TInner>::Failure(Raw.Error));
			return;
		}

		TResponse Parsed;
		if (!FJsonObjectConverter::JsonObjectStringToUStruct<TResponse>(Raw.Value, &Parsed, 0, 0))
		{
			OnComplete(FGuidonResult<TInner>::Failure(FString::Printf(TEXT("Failed to parse %s."), Context)));
			return;
		}

		OnComplete(FGuidonResult<TInner>::Success(Extract(Parsed)));
	}

	void ListProjects(TFunction<void(FGuidonResult<TArray<FGuidonProject>>)> OnComplete)
	{
		SendAsync(TEXT("GET"), TEXT("/api/v1/projects"), TOptional<FString>(),
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonProjectsResponse, TArray<FGuidonProject>>(
					Raw, TEXT("projects"),
					[](const FGuidonProjectsResponse& R) { return R.projects; },
					OnComplete);
			});
	}

	void ListTasks(const FString& ProjectId, TFunction<void(FGuidonResult<TArray<FGuidonTask>>)> OnComplete)
	{
		SendAsync(TEXT("GET"), FString::Printf(TEXT("/api/v1/projects/%s/tasks"), *ProjectId), TOptional<FString>(),
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonTasksResponse, TArray<FGuidonTask>>(
					Raw, TEXT("tasks"),
					[](const FGuidonTasksResponse& R) { return R.tasks; },
					OnComplete);
			});
	}

	void SetTaskStatus(const FString& TaskId, const FString& Status, TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete)
	{
		FGuidonStatusPatchBody Body;
		Body.status = Status;
		FString Json;
		FJsonObjectConverter::UStructToJsonObjectString(Body, Json);

		SendAsync(TEXT("PATCH"), FString::Printf(TEXT("/api/v1/tasks/%s/status"), *TaskId), Json,
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonTaskResponse, FGuidonTask>(
					Raw, TEXT("task"),
					[](const FGuidonTaskResponse& R) { return R.task; },
					OnComplete);
			});
	}

	void ListComments(const FString& TaskId, TFunction<void(FGuidonResult<TArray<FGuidonComment>>)> OnComplete)
	{
		SendAsync(TEXT("GET"), FString::Printf(TEXT("/api/v1/tasks/%s/comment"), *TaskId), TOptional<FString>(),
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonCommentsResponse, TArray<FGuidonComment>>(
					Raw, TEXT("comments"),
					[](const FGuidonCommentsResponse& R) { return R.comments; },
					OnComplete);
			});
	}

	void AddComment(const FString& TaskId, const FString& Content, TFunction<void(FGuidonResult<FGuidonComment>)> OnComplete)
	{
		FGuidonCommentPostBody Body;
		Body.content = Content;
		FString Json;
		FJsonObjectConverter::UStructToJsonObjectString(Body, Json);

		SendAsync(TEXT("POST"), FString::Printf(TEXT("/api/v1/tasks/%s/comment"), *TaskId), Json,
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonCommentResponse, FGuidonComment>(
					Raw, TEXT("comment"),
					[](const FGuidonCommentResponse& R) { return R.comment; },
					OnComplete);
			});
	}

	void CreateTask(
		const FString& ProjectId,
		const FString& Title,
		const FString& Description,
		const FString& Priority,
		const FString& DueDateIso,
		const FString& ParentTaskId,
		const FString& Status,
		TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete)
	{
		FGuidonCreateTaskBody Body;
		Body.title = Title;
		Body.description = Description;
		Body.priority = Priority;
		Body.due_date = DueDateIso;
		Body.parent_task_id = ParentTaskId;
		Body.status = Status;
		FString Json;
		FJsonObjectConverter::UStructToJsonObjectString(Body, Json);

		SendAsync(TEXT("POST"), FString::Printf(TEXT("/api/v1/projects/%s/tasks"), *ProjectId), Json,
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonTaskResponse, FGuidonTask>(
					Raw, TEXT("task"),
					[](const FGuidonTaskResponse& R) { return R.task; },
					OnComplete);
			});
	}

	void UpdateTaskFields(
		const FString& TaskId,
		const FString& Title,
		const FString& Description,
		const FString& Priority,
		const FString& DueDateIso,
		TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete)
	{
		FGuidonUpdateTaskFieldsBody Body;
		Body.title = Title;
		Body.description = Description;
		Body.priority = Priority;
		Body.due_date = DueDateIso;
		FString Json;
		FJsonObjectConverter::UStructToJsonObjectString(Body, Json);

		SendAsync(TEXT("PATCH"), FString::Printf(TEXT("/api/v1/tasks/%s"), *TaskId), Json,
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonTaskResponse, FGuidonTask>(
					Raw, TEXT("task"),
					[](const FGuidonTaskResponse& R) { return R.task; },
					OnComplete);
			});
	}

	void UpdateSortOrder(const FString& TaskId, float SortOrder, TFunction<void(FGuidonResult<FGuidonTask>)> OnComplete)
	{
		FGuidonUpdateSortOrderBody Body;
		Body.sort_order = SortOrder;
		FString Json;
		FJsonObjectConverter::UStructToJsonObjectString(Body, Json);

		SendAsync(TEXT("PATCH"), FString::Printf(TEXT("/api/v1/tasks/%s"), *TaskId), Json,
			[OnComplete](FGuidonResult<FString> Raw)
			{
				ParseWrapped<FGuidonTaskResponse, FGuidonTask>(
					Raw, TEXT("task"),
					[](const FGuidonTaskResponse& R) { return R.task; },
					OnComplete);
			});
	}

	void DeleteTask(const FString& TaskId, TFunction<void(FGuidonResult<bool>)> OnComplete)
	{
		SendAsync(TEXT("DELETE"), FString::Printf(TEXT("/api/v1/tasks/%s"), *TaskId), TOptional<FString>(),
			[OnComplete](FGuidonResult<FString> Raw)
			{
				OnComplete(Raw.bOk ? FGuidonResult<bool>::Success(true) : FGuidonResult<bool>::Failure(Raw.Error));
			});
	}
}
```

- [ ] **Step 3: Self-check**

Cross-check each of the 9 endpoint paths/verbs against the real `GuidonApiClient.cs` (already re-read at this task's start): `GET /api/v1/projects`, `GET /api/v1/projects/{id}/tasks`, `PATCH /api/v1/tasks/{id}/status`, `GET /api/v1/tasks/{id}/comment`, `POST /api/v1/tasks/{id}/comment`, `POST /api/v1/projects/{id}/tasks`, `PATCH /api/v1/tasks/{id}` (used by both `UpdateTaskFields` and `UpdateSortOrder`, distinguished only by which body DTO gets serialized - matches the Unity client's own comment about why two body types exist for the one endpoint), `DELETE /api/v1/tasks/{id}`.

`FHttpModule::Get().CreateRequest()` returns `TSharedRef<IHttpRequest, ESPMode::ThreadSafe>` (aliased `FHttpRequestRef` in some engine versions) - stable, documented UE HTTP module API since UE4, unchanged in 5.7. `Request->OnProcessRequestComplete()` returns an `FHttpRequestCompleteDelegate` you `BindLambda` on, invoked with `(FHttpRequestPtr, FHttpResponsePtr, bool bConnectedSuccessfully)` - also stable since UE4. `EHttpResponseCodes::IsOk(int32)` is the real, documented helper for "200-299" (in `Interfaces/IHttpResponse.h`) - used here instead of a hand-rolled range check. `FJsonObjectConverter::JsonObjectStringToUStruct<T>(JsonString, &OutStruct, CheckFlags, SkipFlags)` and `UStructToJsonObjectString(Struct, OutJsonString)` are the real, documented one-shot string↔struct helpers in `JsonObjectConverter.h` (the module already declared as a `PrivateDependencyModuleNames` entry in Task 1's Build.cs) - passing `0, 0` for the flag parameters means "no field filtering," matching every field always round-tripping, same as Unity's `JsonUtility` having no per-field omission.

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonApiClient.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonApiClient.cpp
git commit -m "Add GuidonApiClient: FHttpModule wrapper over /api/v1"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 6: GuidonBrowserAuth (loopback browser login)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonBrowserAuth.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonBrowserAuth.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonBrowserAuth.cs` in full. This task carries the MOST implementation risk in the whole plan (flagged explicitly, not glossed over): UE's `HTTPServer` module is real and documented, but it is far less commonly used than the HTTP *client* module in Task 5, and the exact behavior of `GetHttpRouter`/`StartAllListeners` when a candidate port is already in use is the one API area this plan is least certain about (Unity's `HttpListener.Start()` throws cleanly on a bound port, which is what the reference implementation's port-scan loop catches - UE's equivalent failure signal needs extra scrutiny during the user's own compile-and-test pass, called out again in this task's self-check).

**Behavior to preserve exactly:** try local ports `51820`-`51829` in order until one binds; open `{BaseUrl}/auth/plugin-login?redirect_uri=http://localhost:{port}/callback&state={guid}` in the system browser; wait (non-blockingly - the Editor must stay responsive) up to 5 minutes for a `GET /callback?apiKey=...&email=...&state=...` request; verify the returned `state` matches; respond with a small HTML page; tear down the listener; report success/failure via callback, matching Unity's `GuidonResult<LoginResponse>` return shape (`FGuidonResult<FGuidonLoginResult>` here).

- [ ] **Step 1: Write the header**

```cpp
// GuidonBrowserAuth.h
#pragma once

#include "CoreMinimal.h"
#include "GuidonApiClient.h"
#include "GuidonModels.h"

/**
 * Browser-based login: opens the real Guidon website (login page, password
 * reset, OAuth - everything it already has) instead of reimplementing a
 * login form inside the Editor's Slate UI. Same loopback pattern well-known
 * CLI tools use (gh auth login, gcloud auth login) - start a tiny local
 * HTTP listener, send the browser to the website with the listener's
 * address as the return target, receive the issued API key back on that
 * local port once the user approves on /auth/plugin-login. Direct port of
 * GuidonBrowserAuth.cs; UE's HTTPServer module plays the role Unity's
 * System.Net.HttpListener does.
 */
namespace GuidonBrowserAuth
{
	void LoginAsync(const FString& BaseUrl, TFunction<void(FGuidonResult<FGuidonLoginResult>)> OnComplete);
}
```

- [ ] **Step 2: Write the implementation**

```cpp
// GuidonBrowserAuth.cpp
#include "GuidonBrowserAuth.h"
#include "HttpServerModule.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"
#include "HttpPath.h"
#include "HttpServerHttpVersion.h"
#include "HAL/PlatformProcess.h"
#include "Containers/Ticker.h"
#include "Misc/Guid.h"
#include "Misc/DateTime.h"

namespace GuidonBrowserAuth
{
	static constexpr uint32 PortRangeStart = 51820;
	static constexpr uint32 PortRangeEnd = 51830;
	static constexpr double TimeoutSeconds = 5.0 * 60.0;

	/**
	 * Shared per-login-attempt state, kept alive by the lambdas that
	 * capture it (TSharedPtr, not a stack local - the router's request
	 * handler and the ticker's timeout check both outlive this function's
	 * own call frame, exactly like Unity's version keeping `listener` alive
	 * across its own async await).
	 */
	struct FLoginSession : TSharedFromThis<FLoginSession>
	{
		TSharedPtr<IHttpRouter> Router;
		FHttpRouteHandle RouteHandle;
		uint32 Port = 0;
		FString State;
		FDateTime StartedAt;
		bool bCompleted = false;
		FTSTicker::FDelegateHandle TimeoutTickerHandle;
		TFunction<void(FGuidonResult<FGuidonLoginResult>)> OnComplete;

		void Complete(FGuidonResult<FGuidonLoginResult> Result)
		{
			if (bCompleted)
			{
				return;
			}
			bCompleted = true;

			if (TimeoutTickerHandle.IsValid())
			{
				FTSTicker::GetCoreTicker().RemoveTicker(TimeoutTickerHandle);
			}
			if (Router.IsValid() && RouteHandle.IsValid())
			{
				Router->UnbindRoute(RouteHandle);
			}
			FHttpServerModule::Get().StopAllListeners();

			OnComplete(MoveTemp(Result));
		}
	};

	static TUniquePtr<FHttpServerResponse> MakeCallbackPage(bool bOk)
	{
		const TCHAR* Title = bOk ? TEXT("Logged in") : TEXT("Login failed");
		const TCHAR* Message = bOk
			? TEXT("You're logged in - you can close this tab and return to Unreal Editor.")
			: TEXT("Something went wrong - return to Unreal Editor and try again.");

		const FString Html = FString::Printf(
			TEXT("<html><head><title>Guidon</title></head>")
			TEXT("<body style=\"font-family:sans-serif;text-align:center;padding-top:80px;\">")
			TEXT("<h2>%s</h2><p>%s</p></body></html>"),
			Title, Message);

		return FHttpServerResponse::Create(Html, TEXT("text/html; charset=utf-8"));
	}

	void LoginAsync(const FString& BaseUrl, TFunction<void(FGuidonResult<FGuidonLoginResult>)> OnComplete)
	{
		if (BaseUrl.IsEmpty())
		{
			OnComplete(FGuidonResult<FGuidonLoginResult>::Failure(TEXT("Set a base URL first.")));
			return;
		}

		TSharedRef<FLoginSession> Session = MakeShared<FLoginSession>();
		Session->OnComplete = OnComplete;
		Session->State = FGuid::NewGuid().ToString(EGuidFormats::Digits);
		Session->StartedAt = FDateTime::UtcNow();

		FHttpServerModule& ServerModule = FHttpServerModule::Get();

		TSharedPtr<IHttpRouter> FoundRouter;
		uint32 FoundPort = 0;
		for (uint32 Candidate = PortRangeStart; Candidate < PortRangeEnd; ++Candidate)
		{
			TSharedPtr<IHttpRouter> Router = ServerModule.GetHttpRouter(Candidate);
			if (Router.IsValid())
			{
				FoundRouter = Router;
				FoundPort = Candidate;
				break;
			}
		}

		if (!FoundRouter.IsValid())
		{
			OnComplete(FGuidonResult<FGuidonLoginResult>::Failure(
				FString::Printf(TEXT("Could not open a local port for browser login (tried %d-%d). Close any other Guidon login attempt and try again."),
					PortRangeStart, PortRangeEnd - 1)));
			return;
		}

		Session->Router = FoundRouter;
		Session->Port = FoundPort;

		TWeakPtr<FLoginSession> WeakSession = Session;

		Session->RouteHandle = FoundRouter->BindRoute(
			FHttpPath(TEXT("/callback")),
			EHttpServerRequestVerbs::VERB_GET,
			FHttpRequestHandler::CreateLambda(
				[WeakSession](const FHttpServerRequest& Request, const FHttpResultCallback& OnRequestComplete) -> bool
				{
					TSharedPtr<FLoginSession> PinnedSession = WeakSession.Pin();
					if (!PinnedSession.IsValid())
					{
						return false;
					}

					const FString* ApiKeyParam = Request.QueryParams.Find(TEXT("apiKey"));
					const FString* EmailParam = Request.QueryParams.Find(TEXT("email"));
					const FString* StateParam = Request.QueryParams.Find(TEXT("state"));

					const bool bOk = ApiKeyParam != nullptr && !ApiKeyParam->IsEmpty()
						&& StateParam != nullptr && *StateParam == PinnedSession->State;

					OnRequestComplete(MakeCallbackPage(bOk));

					if (bOk)
					{
						FGuidonLoginResult LoginResult;
						LoginResult.ApiKey = *ApiKeyParam;
						LoginResult.Email = EmailParam != nullptr ? *EmailParam : FString();
						PinnedSession->Complete(FGuidonResult<FGuidonLoginResult>::Success(LoginResult));
					}
					else
					{
						PinnedSession->Complete(FGuidonResult<FGuidonLoginResult>::Failure(
							TEXT("Login was not completed, or the response could not be verified.")));
					}

					return true;
				}));

		ServerModule.StartAllListeners();

		const FString State = Session->State;
		const FString RedirectUri = FString::Printf(TEXT("http://localhost:%d/callback"), Session->Port);
		FString Url = BaseUrl;
		Url.RemoveFromEnd(TEXT("/"));
		Url += TEXT("/auth/plugin-login?redirect_uri=") + FGenericPlatformHttp::UrlEncode(RedirectUri) + TEXT("&state=") + State;

		FPlatformProcess::LaunchURL(*Url, nullptr, nullptr);

		// Non-blocking timeout watchdog - the Editor must stay responsive
		// while we wait for the browser round-trip, so this polls via the
		// core ticker rather than sleeping the calling thread.
		Session->TimeoutTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
			FTickerDelegate::CreateLambda(
				[WeakSession](float) -> bool
				{
					TSharedPtr<FLoginSession> PinnedSession = WeakSession.Pin();
					if (!PinnedSession.IsValid() || PinnedSession->bCompleted)
					{
						return false;
					}

					if ((FDateTime::UtcNow() - PinnedSession->StartedAt).GetTotalSeconds() >= TimeoutSeconds)
					{
						PinnedSession->Complete(FGuidonResult<FGuidonLoginResult>::Failure(
							TEXT("Login timed out - no response from the browser within 5 minutes.")));
						return false;
					}

					return true;
				}),
			1.0f);
	}
}
```

- [ ] **Step 3: Self-check (extra scrutiny - this is the plan's highest-risk file)**

`FHttpServerModule::Get().GetHttpRouter(Port)` is the real, documented entry point for binding a route on a given port (module `HTTPServer`, already added to `Build.cs` in Task 1) - **the one genuinely uncertain point** is whether `GetHttpRouter` reliably returns an invalid/null pointer when `Port` is already bound by another process (the port-scan loop above assumes it does, mirroring `HttpListener.Start()` throwing in the Unity version) versus succeeding at the router-object level and only failing later when `StartAllListeners()` actually binds the socket. If real UE 5.7 behavior differs (e.g. `StartAllListeners()`'s return value or a listener-specific failure delegate is the actual place a bound-port conflict surfaces), this port-scan loop needs to move that check to `StartAllListeners()`'s result instead - flag this specifically to the user as the first thing to check if login ever silently fails to open a listener. `BindRoute(FHttpPath, EHttpServerRequestVerbs, FHttpRequestHandler)` returning `FHttpRouteHandle`, and the handler signature `bool(const FHttpServerRequest&, const FHttpResultCallback&)` returning `true`/calling `OnRequestComplete` with a `TUniquePtr<FHttpServerResponse>`, are both stable per UE's `HTTPServer` module docs. `FHttpServerRequest::QueryParams` being a `TMap<FString, FString>` matches every other UE codebase example of reading query params from this module. `FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate, float IntervalSeconds)` returning a removable handle is the standard non-blocking periodic-callback idiom for exactly this "poll without blocking the Editor" need. `FGenericPlatformHttp::UrlEncode` is the real, engine-provided URL-encoding helper (used instead of hand-rolling percent-encoding for the `redirect_uri` query value).

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonBrowserAuth.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonBrowserAuth.cpp
git commit -m "Add GuidonBrowserAuth: loopback browser login via HTTPServer module"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 7: GuidonMarkdown (Markdown → Slate rich text)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonMarkdown.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonMarkdown.cpp`

**Before writing:** the real `plugins/unity/GuidonTasks/Editor/GuidonMarkdown.cs` (already read in full above) is regex-based, converting the same Markdown subset (headers h1-h6, bold, italic via `*`/`_`, inline code, links, bullet lists) to Unity's IMGUI rich-text tag syntax (`<b>`, `<i>`, `<size=N>`, `<color=#RRGGBB>`) - **that exact tag syntax does not exist in Slate**. Slate's `SRichTextBlock` uses its own `<TagName>content</>` markup where `TagName` is looked up as a named `FTextBlockStyle` in a `DecoratorStyleSet` passed to the widget (not inline hex colors/sizes) - this is the standard, documented way `SRichTextBlock` is used for simple styled text without writing a custom `ITextDecorator` subclass. So this port targets that tag syntax instead, with the matching named styles registered in `GuidonStyles` (Task 8) and consumed by `SGuidonTaskDetailWindow`'s description preview (Task 11).

**Behavior to preserve exactly:** same 6 regex passes, run in the same order on each pass's own output (headers → bold → italic-star → italic-underscore → inline-code → links → bullets), same "no tables/code-blocks/nested-lists/clickable-links" non-goals, links render as styled text followed by ` (url)` in plain parentheses rather than being clickable (Slate rich text decorators for hyperlinks require a click-handling `FSlateHyperlinkRun` setup that's out of scope here, same reasoning as Unity's own IMGUI limitation).

- [ ] **Step 1: Write the header**

```cpp
// GuidonMarkdown.h
#pragma once

#include "CoreMinimal.h"

/**
 * Converts the common Markdown subset (bold, italic, inline code, headers,
 * bullet lists, links) to Slate's <TagName>content</> rich-text markup -
 * not a CommonMark implementation, same scope as GuidonMarkdown.cs. No
 * tables, code blocks, nested lists, or clickable links; a link renders as
 * styled text followed by its URL in parentheses instead of being
 * clickable. Regex-based on purpose, same "zero extra dependency for a
 * description viewer" reasoning as the Unity version.
 *
 * The tag names this emits (Bold, Italic, Code, Link, H1..H6) must exist
 * as named FTextBlockStyle entries in whatever ISlateStyle is passed as
 * an SRichTextBlock's DecoratorStyleSet - see GuidonStyles (Task 8).
 */
namespace GuidonMarkdown
{
	FString ToRichText(const FString& Markdown);
}
```

- [ ] **Step 2: Write the implementation**

```cpp
// GuidonMarkdown.cpp
#include "GuidonMarkdown.h"
#include "Internationalization/Regex.h"

namespace GuidonMarkdown
{
	static FString ReplaceAll(const FString& Input, const FRegexPattern& Pattern, TFunctionRef<FString(const FRegexMatcher&)> BuildReplacement)
	{
		FString Result;
		Result.Reserve(Input.Len());

		int32 LastEnd = 0;
		FRegexMatcher Matcher(Pattern, Input);
		while (Matcher.FindNext())
		{
			const int32 Begin = Matcher.GetMatchBeginning();
			const int32 End = Matcher.GetMatchEnding();

			Result += Input.Mid(LastEnd, Begin - LastEnd);
			Result += BuildReplacement(Matcher);
			LastEnd = End;
		}
		Result += Input.Mid(LastEnd);

		return Result;
	}

	FString ToRichText(const FString& Markdown)
	{
		if (Markdown.IsEmpty())
		{
			return Markdown;
		}

		FString Text = Markdown;

		// Headers: ^(#{1,6})[ \t]+(.*)$ -> <H{level}>content</>
		{
			static const FRegexPattern HeaderPattern(TEXT("(?m)^(#{1,6})[ \\t]+(.*)$"));
			Text = ReplaceAll(Text, HeaderPattern, [](const FRegexMatcher& M)
			{
				FRegexMatcher& NonConstM = const_cast<FRegexMatcher&>(M);
				const int32 Level = NonConstM.GetCaptureGroup(1).Len();
				const FString Content = NonConstM.GetCaptureGroup(2);
				return FString::Printf(TEXT("<H%d>%s</>"), Level, *Content);
			});
		}

		// Bold: **content** -> <Bold>content</>
		{
			static const FRegexPattern BoldPattern(TEXT("\\*\\*(.+?)\\*\\*"));
			Text = ReplaceAll(Text, BoldPattern, [](const FRegexMatcher& M)
			{
				return FString::Printf(TEXT("<Bold>%s</>"), *const_cast<FRegexMatcher&>(M).GetCaptureGroup(1));
			});
		}

		// Italic (*content*, not part of **): (?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*) -> <Italic>content</>
		{
			static const FRegexPattern ItalicStarPattern(TEXT("(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)"));
			Text = ReplaceAll(Text, ItalicStarPattern, [](const FRegexMatcher& M)
			{
				return FString::Printf(TEXT("<Italic>%s</>"), *const_cast<FRegexMatcher&>(M).GetCaptureGroup(1));
			});
		}

		// Italic (_content_, not part of __): same shape as the star version, underscore-delimited
		{
			static const FRegexPattern ItalicUnderscorePattern(TEXT("(?<!_)_(?!_)(.+?)(?<!_)_(?!_)"));
			Text = ReplaceAll(Text, ItalicUnderscorePattern, [](const FRegexMatcher& M)
			{
				return FString::Printf(TEXT("<Italic>%s</>"), *const_cast<FRegexMatcher&>(M).GetCaptureGroup(1));
			});
		}

		// Inline code: `content` -> <Code>content</>
		{
			static const FRegexPattern InlineCodePattern(TEXT("`([^`]+?)`"));
			Text = ReplaceAll(Text, InlineCodePattern, [](const FRegexMatcher& M)
			{
				return FString::Printf(TEXT("<Code>%s</>"), *const_cast<FRegexMatcher&>(M).GetCaptureGroup(1));
			});
		}

		// Links: [text](url) -> <Link>text</> (url) - not clickable, same as Unity's version
		{
			static const FRegexPattern LinkPattern(TEXT("\\[(.+?)\\]\\((\\S+?)\\)"));
			Text = ReplaceAll(Text, LinkPattern, [](const FRegexMatcher& M)
			{
				FRegexMatcher& NonConstM = const_cast<FRegexMatcher&>(M);
				return FString::Printf(TEXT("<Link>%s</> (%s)"), *NonConstM.GetCaptureGroup(1), *NonConstM.GetCaptureGroup(2));
			});
		}

		// Bullets: ^[ \t]*[-*][ \t]+(.*)$ -> "•  content" (plain text prefix, no decorator)
		{
			static const FRegexPattern BulletPattern(TEXT("(?m)^[ \\t]*[-*][ \\t]+(.*)$"));
			Text = ReplaceAll(Text, BulletPattern, [](const FRegexMatcher& M)
			{
				return FString::Printf(TEXT("•  %s"), *const_cast<FRegexMatcher&>(M).GetCaptureGroup(1));
			});
		}

		return Text;
	}
}
```

- [ ] **Step 3: Self-check**

Cross-check every regex against the real C# patterns in `GuidonMarkdown.cs` (re-read at this task's start) - same 6 patterns in the same order, .NET regex syntax and UE's `FRegexPattern`/`FRegexMatcher` (ICU-based) both support the lookaround assertions used here (`(?<!\*)`/`(?!\*)`) and the multiline flag via the inline `(?m)` modifier (UE's `FRegexPattern` has no separate `RegexOptions.Multiline` flag parameter the way .NET does - the inline `(?m)` group modifier is the correct, documented way to get the same per-line `^`/`$` behavior in ICU regex). `FRegexMatcher::GetCaptureGroup(int32)` and `FindNext()`/`GetMatchBeginning()`/`GetMatchEnding()` are the real, stable API for `Internationalization/Regex.h`, present since UE4. The header-size mapping Unity does (`Math.Max(11, 17 - (level-1)*2)`) is deliberately NOT reproduced as an inline size here - it becomes six separate named styles (`H1`..`H6`) with their own fixed font sizes set once in `GuidonStyles` (Task 8), which is the correct Slate-idiomatic equivalent of "each header level gets a distinct, slightly smaller-as-level-increases size."

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonMarkdown.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonMarkdown.cpp
git commit -m "Add GuidonMarkdown: Markdown subset to Slate rich-text tag conversion"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 8: GuidonStyles (colors + rich-text styles matching the real site)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonStyles.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonStyles.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonStyles.cs` in full (443 lines) - the hex colors below are copied verbatim from it (which itself copied them verbatim from `src/app/globals.css`'s design tokens and `task-board.ts`'s `BOARD_COLUMNS.accentClass` mapping - a manual-sync point, same caveat as `GuidonVocabulary`). This task only ports the **dark-mode palette** (`EditorGUIUtility.isProSkin` branch in the C# source) - a deliberate, stated scope reduction: the vast majority of UE Editor installs run the dark theme, and UE's own light/dark theme-detection API is less certain than what Task 6 already flags as this plan's highest-risk area, so it's not worth chasing here. If the user's Editor runs a light theme, colors will look like the site's dark mode regardless - noted as a known limitation, not silently dropped.

- [ ] **Step 1: Write the header**

```cpp
// GuidonStyles.h
#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateStyle.h"

/**
 * Registers a named FSlateStyleSet ("GuidonTasksStyle") with the colors and
 * rich-text tag styles (Bold/Italic/Code/Link/H1..H6, consumed by
 * GuidonMarkdown's output) the Kanban board and task detail window need.
 * Dark-mode-only port of GuidonStyles.cs's isProSkin branch - see this
 * task's own note on why.
 */
class FGuidonStyles
{
public:
	static void Initialize();
	static void Shutdown();

	static const ISlateStyle& Get();
	static FName GetStyleSetName();

	/** Mirrors GuidonStyles.cs's PriorityColor - low/medium/high/critical, defaulting to medium. */
	static FLinearColor PriorityColor(const FString& Priority);

	/**
	 * Mirrors GuidonStyles.cs's ColumnAccentColor exactly (not invented):
	 * backlog -> muted-foreground, todo/ai_working -> info, in_progress ->
	 * warning, review -> primary/accent, done -> success.
	 */
	static FLinearColor ColumnAccentColor(const FString& Status);

	static FLinearColor WindowBackground();
	static FLinearColor ColumnBackground();
	static FLinearColor CardBackground();
	static FLinearColor BorderColor();
	static FLinearColor TextColor();
	static FLinearColor MutedTextColor();
	static FLinearColor AccentColor();

private:
	static TSharedPtr<class FSlateStyleSet> StyleInstance;
	static TSharedRef<class FSlateStyleSet> Create();
};
```

- [ ] **Step 2: Write the implementation**

```cpp
// GuidonStyles.cpp
#include "GuidonStyles.h"
#include "Styling/SlateStyleRegistry.h"
#include "Styling/SlateTypes.h"
#include "Styling/CoreStyle.h"

TSharedPtr<FSlateStyleSet> FGuidonStyles::StyleInstance = nullptr;

namespace
{
	// --color-background / --color-background-secondary / --color-card /
	// --color-border / --color-foreground / --color-muted-foreground /
	// --color-primary - dark-mode values only, copied verbatim from
	// GuidonStyles.cs's isProSkin branch (itself copied from
	// src/app/globals.css).
	FLinearColor HexColor(const TCHAR* Hex)
	{
		return FLinearColor(FColor::FromHex(Hex));
	}
}

FName FGuidonStyles::GetStyleSetName()
{
	static FName StyleSetName(TEXT("GuidonTasksStyle"));
	return StyleSetName;
}

FLinearColor FGuidonStyles::WindowBackground() { return HexColor(TEXT("#0b0d10")); }
FLinearColor FGuidonStyles::ColumnBackground() { return HexColor(TEXT("#101317")); }
FLinearColor FGuidonStyles::CardBackground() { return HexColor(TEXT("#101317")); }
FLinearColor FGuidonStyles::BorderColor() { return HexColor(TEXT("#23272f")); }
FLinearColor FGuidonStyles::TextColor() { return HexColor(TEXT("#e8eaed")); }
FLinearColor FGuidonStyles::MutedTextColor() { return HexColor(TEXT("#8b93a1")); }
FLinearColor FGuidonStyles::AccentColor() { return HexColor(TEXT("#4d8dff")); }

FLinearColor FGuidonStyles::PriorityColor(const FString& Priority)
{
	if (Priority == TEXT("low")) return MutedTextColor();
	if (Priority == TEXT("high")) return HexColor(TEXT("#fbbf24"));
	if (Priority == TEXT("critical")) return HexColor(TEXT("#f87171"));
	return HexColor(TEXT("#60a5fa")); // medium (also the default, matching GuidonStyles.cs's switch default)
}

FLinearColor FGuidonStyles::ColumnAccentColor(const FString& Status)
{
	static const FLinearColor InfoColor = HexColor(TEXT("#60a5fa"));
	static const FLinearColor WarningColor = HexColor(TEXT("#fbbf24"));
	static const FLinearColor SuccessColor = HexColor(TEXT("#34d399"));

	if (Status == TEXT("todo") || Status == TEXT("ai_working")) return InfoColor;
	if (Status == TEXT("in_progress")) return WarningColor;
	if (Status == TEXT("review")) return AccentColor();
	if (Status == TEXT("done")) return SuccessColor;
	return MutedTextColor(); // backlog
}

TSharedRef<FSlateStyleSet> FGuidonStyles::Create()
{
	TSharedRef<FSlateStyleSet> Style = MakeShared<FSlateStyleSet>(GetStyleSetName());

	const FTextBlockStyle NormalText = FTextBlockStyle()
		.SetFont(FCoreStyle::GetDefaultFontStyle(TEXT("Regular"), 9))
		.SetColorAndOpacity(TextColor());

	Style->Set(TEXT("Guidon.NormalText"), NormalText);

	Style->Set(TEXT("Bold"), FTextBlockStyle(NormalText)
		.SetFont(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"), 9)));

	Style->Set(TEXT("Italic"), FTextBlockStyle(NormalText)
		.SetFont(FCoreStyle::GetDefaultFontStyle(TEXT("Italic"), 9)));

	Style->Set(TEXT("Code"), FTextBlockStyle(NormalText)
		.SetFont(FCoreStyle::GetDefaultFontStyle(TEXT("Mono"), 9))
		.SetColorAndOpacity(HexColor(TEXT("#D19A66"))));

	Style->Set(TEXT("Link"), FTextBlockStyle(NormalText)
		.SetColorAndOpacity(HexColor(TEXT("#4A9EFF"))));

	// H1..H6: same "each level a bit smaller" intent as GuidonStyles.cs's
	// Math.Max(11, 17 - (level-1)*2) formula, expressed as six fixed sizes
	// instead of a runtime computation, since each is now a separate named
	// style rather than an inline <size=N> tag.
	const int32 HeaderSizes[6] = { 17, 15, 13, 12, 11, 11 };
	for (int32 Level = 1; Level <= 6; ++Level)
	{
		Style->Set(FName(*FString::Printf(TEXT("H%d"), Level)), FTextBlockStyle(NormalText)
			.SetFont(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"), HeaderSizes[Level - 1])));
	}

	return Style;
}

void FGuidonStyles::Initialize()
{
	if (!StyleInstance.IsValid())
	{
		StyleInstance = Create();
		FSlateStyleRegistry::RegisterSlateStyle(*StyleInstance);
	}
}

void FGuidonStyles::Shutdown()
{
	if (StyleInstance.IsValid())
	{
		FSlateStyleRegistry::UnRegisterSlateStyle(*StyleInstance);
		StyleInstance.Reset();
	}
}

const ISlateStyle& FGuidonStyles::Get()
{
	return *StyleInstance;
}
```

- [ ] **Step 3: Self-check**

Every hex value above must match `GuidonStyles.cs`'s dark-mode (`isProSkin`) branch exactly - re-verify each one against the file re-read at this task's start rather than trusting this plan's transcription. `FColor::FromHex(const TCHAR*)` accepting a leading `#` and returning a gamma-space `FColor` (converted to `FLinearColor` via the constructor, which does the correct sRGB→linear conversion) is the standard, documented way to parse a web hex color in UE. `FSlateStyleSet`/`FSlateStyleRegistry::RegisterSlateStyle`/`UnRegisterSlateStyle` is the real, stable pattern every UE Editor plugin that defines its own style uses (same shape as `FEditorStyle`/`FAppStyle`'s own internal setup). `FCoreStyle::GetDefaultFontStyle(FName TypefaceFontName, int32 Size)` returning an `FSlateFontInfo` for the engine's built-in Roboto-family font is real and stable - **the one point worth double-checking against a real UE 5.7 install**: whether `"Mono"` is a valid built-in typeface name in 5.7 (older engine versions shipped `"Regular"`/`"Bold"`/`"Italic"`/`"BoldItalic"` reliably; a monospace variant's exact registered name has moved around across engine versions) - if `"Mono"` isn't found, fall back to `"Regular"` for the Code style rather than have the font silently fail to load.

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonStyles.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonStyles.cpp
git commit -m "Add GuidonStyles: dark-mode palette + rich-text styles matching the site"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 9: SGuidonTaskCard (task card widget + drag source)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/SGuidonTaskCard.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/SGuidonTaskCard.cpp`

One Kanban card: title, priority-colored accent dot, due date if set, subtask-count badge if it has subtasks, clickable to open the detail window, draggable to another column. Slate's native `OnDragDetected`/`FDragDropOperation`/`OnDrop` on the destination is a better-fitting native mechanism here than the Unity plugin had available (its own doc comment notes it had to hand-roll `PointerDownEvent`/`PointerMoveEvent`/`PointerUpEvent` tracking because Unity's UI Toolkit predates a built-in drag-and-drop convenience for this case).

- [ ] **Step 1: Write the header - the card widget and its drag-drop payload type**

```cpp
// SGuidonTaskCard.h
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Input/DragAndDrop.h"
#include "GuidonModels.h"

/** Carries the dragged task's id and its column at drag-start, so the drop target knows whether the column actually changed. */
class FGuidonTaskDragDropOp : public FDragDropOperation
{
public:
	DRAG_DROP_OPERATOR_TYPE(FGuidonTaskDragDropOp, FDragDropOperation)

	FString TaskId;
	FString SourceStatus;
	FString TaskTitle;

	static TSharedRef<FGuidonTaskDragDropOp> New(const FString& InTaskId, const FString& InSourceStatus, const FString& InTaskTitle)
	{
		TSharedRef<FGuidonTaskDragDropOp> Operation = MakeShared<FGuidonTaskDragDropOp>();
		Operation->TaskId = InTaskId;
		Operation->SourceStatus = InSourceStatus;
		Operation->TaskTitle = InTaskTitle;
		Operation->Construct();
		return Operation;
	}

	virtual TSharedPtr<SWidget> GetDefaultDecorator() const override;
};

DECLARE_DELEGATE_OneParam(FOnGuidonTaskClicked, const FGuidonTask&);

class SGuidonTaskCard : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonTaskCard) {}
		SLATE_ARGUMENT(FGuidonTask, Task)
		SLATE_ARGUMENT(int32, SubtaskCount)
		SLATE_EVENT(FOnGuidonTaskClicked, OnClicked)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual FReply OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnDragDetected(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;

	const FGuidonTask& GetTask() const { return Task; }

private:
	FGuidonTask Task;
	FOnGuidonTaskClicked OnClickedDelegate;
	bool bMouseDownInsideCard = false;
};
```

- [ ] **Step 2: Write the implementation**

```cpp
// SGuidonTaskCard.cpp
#include "SGuidonTaskCard.h"
#include "GuidonStyles.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Images/SImage.h"
#include "Styling/CoreStyle.h"

TSharedPtr<SWidget> FGuidonTaskDragDropOp::GetDefaultDecorator() const
{
	return SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FGuidonStyles::CardBackground())
		.Padding(FMargin(8.f, 4.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(TaskTitle))
			.ColorAndOpacity(FGuidonStyles::TextColor())
		];
}

void SGuidonTaskCard::Construct(const FArguments& InArgs)
{
	Task = InArgs._Task;
	OnClickedDelegate = InArgs._OnClicked;
	const int32 SubtaskCount = InArgs._SubtaskCount;

	TSharedRef<SVerticalBox> Content = SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot()
			.AutoWidth()
			.VAlign(VAlign_Center)
			.Padding(FMargin(0.f, 0.f, 6.f, 0.f))
			[
				SNew(SBox)
				.WidthOverride(6.f)
				.HeightOverride(6.f)
				[
					SNew(SImage)
					.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
					.ColorAndOpacity(FGuidonStyles::PriorityColor(Task.priority))
				]
			]
			+ SHorizontalBox::Slot()
			.FillWidth(1.f)
			[
				SNew(STextBlock)
				.Text(FText::FromString(Task.title))
				.ColorAndOpacity(FGuidonStyles::TextColor())
				.AutoWrapText(true)
			]
		];

	if (!Task.due_date.IsEmpty() || SubtaskCount > 0)
	{
		TSharedRef<SHorizontalBox> MetaRow = SNew(SHorizontalBox);

		if (!Task.due_date.IsEmpty())
		{
			MetaRow->AddSlot()
				.AutoWidth()
				.Padding(FMargin(0.f, 4.f, 8.f, 0.f))
				[
					SNew(STextBlock)
					.Text(FText::FromString(Task.due_date))
					.ColorAndOpacity(FGuidonStyles::MutedTextColor())
					.Font(FCoreStyle::GetDefaultFontStyle(TEXT("Regular"), 8))
				];
		}

		if (SubtaskCount > 0)
		{
			MetaRow->AddSlot()
				.AutoWidth()
				.Padding(FMargin(0.f, 4.f, 0.f, 0.f))
				[
					SNew(STextBlock)
					.Text(FText::Format(NSLOCTEXT("GuidonTasks", "SubtaskCountFormat", "{0} subtasks"), FText::AsNumber(SubtaskCount)))
					.ColorAndOpacity(FGuidonStyles::MutedTextColor())
					.Font(FCoreStyle::GetDefaultFontStyle(TEXT("Regular"), 8))
				];
		}

		Content->AddSlot()
			.AutoHeight()
			[
				MetaRow
			];
	}

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FGuidonStyles::CardBackground())
		.Padding(FMargin(8.f))
		[
			Content
		]
	];
}

FReply SGuidonTaskCard::OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (MouseEvent.GetEffectingButton() == EKeys::LeftMouseButton)
	{
		bMouseDownInsideCard = true;
		return FReply::Handled().DetectDrag(SharedThis(this), EKeys::LeftMouseButton);
	}
	return FReply::Unhandled();
}

FReply SGuidonTaskCard::OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (MouseEvent.GetEffectingButton() == EKeys::LeftMouseButton && bMouseDownInsideCard)
	{
		bMouseDownInsideCard = false;
		if (OnClickedDelegate.IsBound())
		{
			OnClickedDelegate.Execute(Task);
		}
		return FReply::Handled();
	}
	return FReply::Unhandled();
}

FReply SGuidonTaskCard::OnDragDetected(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	bMouseDownInsideCard = false; // a drag, not a click - OnMouseButtonUp's click handling must not also fire
	return FReply::Handled().BeginDragDrop(FGuidonTaskDragDropOp::New(Task.id, Task.status, Task.title));
}
```

- [ ] **Step 3: Self-check**

`FReply::Handled().DetectDrag(SharedThis(this), EKeys::LeftMouseButton)` returned from `OnMouseButtonDown`, followed by the engine calling `OnDragDetected` once the pointer moves far enough while still held, is the real, standard Slate drag-initiation sequence (used by e.g. the Content Browser's own asset tiles) - not a guess. `FReply::Handled().BeginDragDrop(Operation)` returned from `OnDragDetected` is the matching standard way to actually start a drag-drop operation carrying a custom `FDragDropOperation` subclass. `DRAG_DROP_OPERATOR_TYPE(ThisClass, BaseClass)` is the real macro every custom `FDragDropOperation` subclass must include (it implements the type-safe `GetOperationAs<T>()` casting used at the drop site in Task 10). The click-vs-drag disambiguation here (only fire `OnClicked` from `OnMouseButtonUp` if `OnDragDetected` didn't already fire and clear `bMouseDownInsideCard`) mirrors the same problem the Unity plugin's own hand-rolled pointer tracking had to solve, just using Slate's built-in `DetectDrag` instead of manual distance-thresholding.

- [ ] **Step 4: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/SGuidonTaskCard.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/SGuidonTaskCard.cpp
git commit -m "Add SGuidonTaskCard: Kanban card widget with drag-and-drop source"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 10: SGuidonTasksWindow (the Kanban board)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/SGuidonTasksWindow.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/SGuidonTasksWindow.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonTasksWindow.cs` in full - this task ports its overall structure (login/logged-out view vs. board view, top bar with project selector + Refresh + logged-in-as/Log out, one column per `GuidonVocabulary::Statuses` entry, per-column task creation, drag-and-drop reorder/status-change commit) rather than reproducing all 688 lines line-by-line; the exact behaviors below are the ones that matter for parity, cross-check against the real file for anything this plan's description understates.

This is the single largest and most state-heavy file in the plugin. It owns: the logged-in-or-not view swap, the loaded project list and selection, the loaded task list for the selected project, and the drag-and-drop commit flow.

- [ ] **Step 1: Write the header**

```cpp
// SGuidonTasksWindow.h
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "GuidonModels.h"
#include "GuidonApiClient.h"

class SGuidonTasksWindow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonTasksWindow) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	// ---- View building ----
	TSharedRef<SWidget> BuildLoggedOutView();
	TSharedRef<SWidget> BuildLoggedInView();
	TSharedRef<SWidget> BuildTopBar();
	TSharedRef<SWidget> BuildColumn(const FString& Status, const FString& StatusLabel);
	TSharedRef<SWidget> BuildAddTaskButton(const FString& Status);
	void RebuildContent();

	// ---- Data flow ----
	void HandleLoginClicked();
	void HandleLogoutClicked();
	void HandleRefreshClicked();
	void LoadProjects();
	void LoadTasks();
	void HandleProjectSelected(TSharedPtr<FGuidonProject> NewSelection, ESelectInfo::Type SelectInfo);
	void HandleTaskClicked(const FGuidonTask& Task);
	void HandleAddTaskClicked(const FString& Status);
	void HandleTaskDropped(const FString& TaskId, const FString& SourceStatus, const FString& DestStatus, int32 DropIndex);

	TArray<FGuidonTask> TasksForStatus(const FString& Status) const;
	int32 SubtaskCountFor(const FString& TaskId) const;

	// ---- State ----
	TSharedPtr<class SBorder> RootContainer;
	TArray<TSharedPtr<FGuidonProject>> Projects;
	TSharedPtr<FGuidonProject> SelectedProject;
	TArray<FGuidonTask> Tasks;
	bool bLoading = false;
	FString ErrorMessage;
	TWeakPtr<SGuidonTasksWindow> WeakSelf;
};
```

- [ ] **Step 2: Write Construct, the logged-out view, and the top bar**

```cpp
// SGuidonTasksWindow.cpp (part 1 of 3 - Construct, logged-out view, top bar)
#include "SGuidonTasksWindow.h"
#include "GuidonSettings.h"
#include "GuidonBrowserAuth.h"
#include "GuidonStyles.h"
#include "GuidonSortOrder.h"
#include "SGuidonTaskCard.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SComboBox.h"

void SGuidonTasksWindow::Construct(const FArguments& InArgs)
{
	WeakSelf = SharedThis(this);

	ChildSlot
	[
		SAssignNew(RootContainer, SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FGuidonStyles::WindowBackground())
		.Padding(FMargin(8.f))
		[
			GuidonSettings::IsConfigured() ? BuildLoggedInView() : BuildLoggedOutView()
		]
	];

	if (GuidonSettings::IsConfigured())
	{
		LoadProjects();
	}
}

void SGuidonTasksWindow::RebuildContent()
{
	if (RootContainer.IsValid())
	{
		RootContainer->SetContent(GuidonSettings::IsConfigured() ? BuildLoggedInView() : BuildLoggedOutView());
	}
}

TSharedRef<SWidget> SGuidonTasksWindow::BuildLoggedOutView()
{
	return SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		.Padding(FMargin(0.f, 40.f))
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(FMargin(0.f, 0.f, 0.f, 12.f))
			[
				SNew(STextBlock)
				.Text(FText::FromString(TEXT("Log in to see your Guidon tasks.")))
				.ColorAndOpacity(FGuidonStyles::TextColor())
			]
			+ SVerticalBox::Slot()
			.AutoHeight()
			[
				SNew(SButton)
				.Text(FText::FromString(TEXT("Log in with Guidon")))
				.OnClicked_Lambda([this]() { HandleLoginClicked(); return FReply::Handled(); })
			]
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(FMargin(0.f, 12.f, 0.f, 0.f))
			[
				SNew(STextBlock)
				.Visibility_Lambda([this]() { return ErrorMessage.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
				.Text_Lambda([this]() { return FText::FromString(ErrorMessage); })
				.ColorAndOpacity(FLinearColor(1.f, 0.4f, 0.4f))
			]
		];
}

TSharedRef<SWidget> SGuidonTasksWindow::BuildTopBar()
{
	TSharedRef<SHorizontalBox> Bar = SNew(SHorizontalBox);

	Bar->AddSlot()
		.AutoWidth()
		.VAlign(VAlign_Center)
		.Padding(FMargin(0.f, 0.f, 8.f, 0.f))
		[
			SNew(SComboBox<TSharedPtr<FGuidonProject>>)
			.OptionsSource(&Projects)
			.OnSelectionChanged(this, &SGuidonTasksWindow::HandleProjectSelected)
			.OnGenerateWidget_Lambda([](TSharedPtr<FGuidonProject> Project)
			{
				return SNew(STextBlock).Text(FText::FromString(Project.IsValid() ? Project->name : FString()));
			})
			[
				SNew(STextBlock)
				.Text_Lambda([this]() { return FText::FromString(SelectedProject.IsValid() ? SelectedProject->name : TEXT("Select a project")); })
			]
		];

	Bar->AddSlot()
		.AutoWidth()
		.VAlign(VAlign_Center)
		.Padding(FMargin(0.f, 0.f, 8.f, 0.f))
		[
			SNew(SButton)
			.Text(FText::FromString(TEXT("Refresh")))
			.OnClicked_Lambda([this]() { HandleRefreshClicked(); return FReply::Handled(); })
		];

	Bar->AddSlot()
		.FillWidth(1.f)
		[
			SNew(SSpacer)
		];

	Bar->AddSlot()
		.AutoWidth()
		.VAlign(VAlign_Center)
		.Padding(FMargin(0.f, 0.f, 8.f, 0.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(FString::Printf(TEXT("Logged in as %s"), *GuidonSettings::GetEmail())))
			.ColorAndOpacity(FGuidonStyles::MutedTextColor())
		];

	Bar->AddSlot()
		.AutoWidth()
		[
			SNew(SButton)
			.Text(FText::FromString(TEXT("Log out")))
			.OnClicked_Lambda([this]() { HandleLogoutClicked(); return FReply::Handled(); })
		];

	return Bar;
}
```

Note on `Construct`/`BuildLoggedOutView`/`BuildTopBar` above: `SAssignNew(RootContainer, SBorder)` binding the constructed widget into the `RootContainer` member while ALSO placing it in `ChildSlot` is the standard Slate idiom for "a widget whose content is swapped later" (real, used constantly in Editor tooling) - `RootContainer->SetContent(...)` in `RebuildContent()` is the matching, correct way to swap the login view for the board view after `HandleLoginClicked`'s async callback completes, without reconstructing the whole `SGuidonTasksWindow`. `SComboBox<TSharedPtr<T>>` with `.OptionsSource`/`.OnGenerateWidget`/`.OnSelectionChanged` and a content slot for the current selection's display widget is the real, standard Slate combo-box pattern. `.OnClicked_Lambda` capturing `this` is safe here specifically because `SGuidonTasksWindow` outlives its own child widgets for their whole lifetime (they're destroyed when this widget is), the same assumption every Slate `SCompoundWidget` with lambda-bound child callbacks relies on. This file continues directly into Step 3 below - don't commit yet, its pieces don't compile independently of each other.

- [ ] **Step 3: Write the board view, the column drop target, and the per-column widgets**

Add this near the top of `SGuidonTasksWindow.cpp`, after the includes, before `SGuidonTasksWindow::Construct`: a small drop-target widget private to this file (not exposed via the header - only `SGuidonTasksWindow` itself needs it).

```cpp
// SGuidonTasksWindow.cpp (part 2 of 3 - column drop target, board view, columns)
#include "Widgets/Layout/SWrapBox.h"

DECLARE_DELEGATE_ThreeParams(FOnGuidonColumnDrop, const FString& /*TaskId*/, const FString& /*SourceStatus*/, int32 /*DropIndex*/);

namespace
{
	/**
	 * Wraps one column's card list and accepts drops of FGuidonTaskDragDropOp.
	 * DropIndex is always "append to the end of this column" for v1 (matches
	 * this plan's stated non-goal: no within-column reorder-by-drop-position
	 * beyond what naturally falls out - see the spec's Non-goals section).
	 */
	class SGuidonColumnDropTarget : public SCompoundWidget
	{
	public:
		SLATE_BEGIN_ARGS(SGuidonColumnDropTarget) {}
			SLATE_ARGUMENT(FString, Status)
			SLATE_EVENT(FOnGuidonColumnDrop, OnDrop)
			SLATE_DEFAULT_SLOT(FArguments, Content)
		SLATE_END_ARGS()

		void Construct(const FArguments& InArgs)
		{
			Status = InArgs._Status;
			OnDropDelegate = InArgs._OnDrop;

			ChildSlot
			[
				SNew(SBorder)
				.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
				.BorderBackgroundColor_Lambda([this]() { return bDragHovering ? FGuidonStyles::AccentColor() : FGuidonStyles::ColumnBackground(); })
				.Padding(FMargin(4.f))
				[
					InArgs._Content.Widget
				]
			];
		}

		virtual void OnDragEnter(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent) override
		{
			if (DragDropEvent.GetOperationAs<FGuidonTaskDragDropOp>().IsValid())
			{
				bDragHovering = true;
			}
		}

		virtual void OnDragLeave(const FDragDropEvent& DragDropEvent) override
		{
			bDragHovering = false;
		}

		virtual FReply OnDragOver(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent) override
		{
			return DragDropEvent.GetOperationAs<FGuidonTaskDragDropOp>().IsValid() ? FReply::Handled() : FReply::Unhandled();
		}

		virtual FReply OnDrop(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent) override
		{
			bDragHovering = false;
			TSharedPtr<FGuidonTaskDragDropOp> Op = DragDropEvent.GetOperationAs<FGuidonTaskDragDropOp>();
			if (!Op.IsValid())
			{
				return FReply::Unhandled();
			}

			if (OnDropDelegate.IsBound())
			{
				OnDropDelegate.Execute(Op->TaskId, Op->SourceStatus, INDEX_NONE); // INDEX_NONE = append at end
			}
			return FReply::Handled();
		}

	private:
		FString Status;
		FOnGuidonColumnDrop OnDropDelegate;
		bool bDragHovering = false;
	};
}

TArray<FGuidonTask> SGuidonTasksWindow::TasksForStatus(const FString& Status) const
{
	TArray<FGuidonTask> Result;
	for (const FGuidonTask& Task : Tasks)
	{
		if (Task.status == Status && Task.parent_task_id.IsEmpty())
		{
			Result.Add(Task);
		}
	}
	Result.Sort([](const FGuidonTask& A, const FGuidonTask& B) { return A.sort_order < B.sort_order; });
	return Result;
}

int32 SGuidonTasksWindow::SubtaskCountFor(const FString& TaskId) const
{
	int32 Count = 0;
	for (const FGuidonTask& Task : Tasks)
	{
		if (Task.parent_task_id == TaskId)
		{
			++Count;
		}
	}
	return Count;
}

TSharedRef<SWidget> SGuidonTasksWindow::BuildAddTaskButton(const FString& Status)
{
	// Matches the real Unity behavior exactly (confirmed by reading
	// GuidonTasksWindow.cs line 353, not assumed): the column's "+" button
	// opens the full detail window in "new task" mode
	// (GuidonTaskDetailWindow.OpenForNewTask) rather than an inline quick-add
	// field - so priority/description/due-date can all be set at creation
	// time, same as on the web app's own task-creation dialog.
	return SNew(SButton)
		.Text(FText::FromString(TEXT("+")))
		.HAlign(HAlign_Center)
		.OnClicked_Lambda([this, Status]() { HandleAddTaskClicked(Status); return FReply::Handled(); });
}

TSharedRef<SWidget> SGuidonTasksWindow::BuildColumn(const FString& Status, const FString& StatusLabel)
{
	TSharedRef<SVerticalBox> CardList = SNew(SVerticalBox);

	for (const FGuidonTask& Task : TasksForStatus(Status))
	{
		CardList->AddSlot()
			.AutoHeight()
			.Padding(FMargin(0.f, 0.f, 0.f, 4.f))
			[
				SNew(SGuidonTaskCard)
				.Task(Task)
				.SubtaskCount(SubtaskCountFor(Task.id))
				.OnClicked(FOnGuidonTaskClicked::CreateSP(this, &SGuidonTasksWindow::HandleTaskClicked))
			];
	}

	return SNew(SBox)
		.WidthOverride(240.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(FMargin(4.f, 0.f, 0.f, 4.f))
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot()
				.AutoWidth()
				.VAlign(VAlign_Center)
				.Padding(FMargin(0.f, 0.f, 6.f, 0.f))
				[
					SNew(SBox)
					.WidthOverride(4.f)
					.HeightOverride(14.f)
					[
						SNew(SImage)
						.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
						.ColorAndOpacity(FGuidonStyles::ColumnAccentColor(Status))
					]
				]
				+ SHorizontalBox::Slot()
				.AutoWidth()
				[
					SNew(STextBlock)
					.Text(FText::FromString(StatusLabel))
					.ColorAndOpacity(FGuidonStyles::TextColor())
				]
			]
			+ SVerticalBox::Slot()
			.FillHeight(1.f)
			[
				SNew(SGuidonColumnDropTarget)
				.Status(Status)
				.OnDrop(FOnGuidonColumnDrop::CreateLambda(
					[this](const FString& TaskId, const FString& SourceStatus, int32 DropIndex)
					{
						HandleTaskDropped(TaskId, SourceStatus, Status, DropIndex);
					}))
				[
					SNew(SScrollBox)
					+ SScrollBox::Slot()
					[
						CardList
					]
				]
			]
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(FMargin(0.f, 4.f, 0.f, 0.f))
			[
				BuildAddTaskButton(Status)
			]
		];
}

TSharedRef<SWidget> SGuidonTasksWindow::BuildLoggedInView()
{
	TSharedRef<SHorizontalBox> Columns = SNew(SHorizontalBox);

	for (int32 Index = 0; Index < GuidonVocabulary::Statuses.Num(); ++Index)
	{
		const FString& Status = GuidonVocabulary::Statuses[Index];
		Columns->AddSlot()
			.AutoWidth()
			.Padding(FMargin(0.f, 0.f, 8.f, 0.f))
			[
				BuildColumn(Status, GuidonVocabulary::StatusLabels[Index])
			];
	}

	return SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(FMargin(0.f, 0.f, 0.f, 8.f))
		[
			BuildTopBar()
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(FMargin(0.f, 0.f, 0.f, 4.f))
		[
			SNew(STextBlock)
			.Visibility_Lambda([this]() { return ErrorMessage.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
			.Text_Lambda([this]() { return FText::FromString(ErrorMessage); })
			.ColorAndOpacity(FLinearColor(1.f, 0.4f, 0.4f))
		]
		+ SVerticalBox::Slot()
		.FillHeight(1.f)
		[
			SNew(SScrollBox)
			.Orientation(Orient_Horizontal)
			+ SScrollBox::Slot()
			[
				Columns
			]
		];
}
```

- [ ] **Step 4: Write the data-flow methods**

`HandleTaskClicked`/`HandleAddTaskClicked` call two free functions declared in `SGuidonTaskDetailWindow.h`, which Task 11 creates next - a forward dependency stated plainly rather than hidden: this file will not fully resolve until Task 11 exists, same as how `SGuidonTaskCard.h` (Task 9) is already a completed dependency of this file. Every `GuidonApiClient` call's completion lambda runs on the game thread (UE's `FHttpModule`/`FHttpManager` ticks and dispatches completed-request delegates from the main engine tick, not a background thread - confirmed, not assumed, and the reason none of the lambdas below need any thread-marshaling to safely touch `this`'s member state or rebuild Slate content directly).

```cpp
// SGuidonTasksWindow.cpp (part 3 of 3 - data flow)
#include "SGuidonTaskDetailWindow.h"

void SGuidonTasksWindow::LoadProjects()
{
	bLoading = true;
	GuidonApiClient::ListProjects(
		[this](FGuidonResult<TArray<FGuidonProject>> Result)
		{
			bLoading = false;
			if (!Result.bOk)
			{
				ErrorMessage = Result.Error;
				RebuildContent();
				return;
			}

			ErrorMessage.Empty();
			Projects.Empty();
			for (const FGuidonProject& Project : Result.Value)
			{
				Projects.Add(MakeShared<FGuidonProject>(Project));
			}

			const FString SavedProjectId = GuidonSettings::GetProjectId();
			SelectedProject.Reset();
			for (const TSharedPtr<FGuidonProject>& Project : Projects)
			{
				if (Project->id == SavedProjectId)
				{
					SelectedProject = Project;
					break;
				}
			}
			if (!SelectedProject.IsValid() && Projects.Num() > 0)
			{
				SelectedProject = Projects[0];
				GuidonSettings::SetProjectId(SelectedProject->id);
			}

			RebuildContent();
			LoadTasks();
		});
}

void SGuidonTasksWindow::LoadTasks()
{
	if (!SelectedProject.IsValid())
	{
		return;
	}

	bLoading = true;
	const FString ProjectId = SelectedProject->id;
	GuidonApiClient::ListTasks(ProjectId,
		[this](FGuidonResult<TArray<FGuidonTask>> Result)
		{
			bLoading = false;
			if (!Result.bOk)
			{
				ErrorMessage = Result.Error;
				RebuildContent();
				return;
			}

			ErrorMessage.Empty();
			Tasks = Result.Value;
			RebuildContent();
		});
}

void SGuidonTasksWindow::HandleLoginClicked()
{
	ErrorMessage.Empty();
	GuidonBrowserAuth::LoginAsync(GuidonSettings::GetBaseUrl(),
		[this](FGuidonResult<FGuidonLoginResult> Result)
		{
			if (!Result.bOk)
			{
				ErrorMessage = Result.Error;
				RebuildContent();
				return;
			}

			GuidonSettings::SetApiKey(Result.Value.ApiKey);
			GuidonSettings::SetEmail(Result.Value.Email);
			RebuildContent();
			LoadProjects();
		});
}

void SGuidonTasksWindow::HandleLogoutClicked()
{
	GuidonSettings::LogOut();
	Projects.Empty();
	SelectedProject.Reset();
	Tasks.Empty();
	ErrorMessage.Empty();
	RebuildContent();
}

void SGuidonTasksWindow::HandleRefreshClicked()
{
	LoadProjects();
}

void SGuidonTasksWindow::HandleProjectSelected(TSharedPtr<FGuidonProject> NewSelection, ESelectInfo::Type SelectInfo)
{
	if (!NewSelection.IsValid() || NewSelection == SelectedProject)
	{
		return;
	}

	SelectedProject = NewSelection;
	GuidonSettings::SetProjectId(SelectedProject->id);
	Tasks.Empty();
	RebuildContent();
	LoadTasks();
}

void SGuidonTasksWindow::HandleTaskClicked(const FGuidonTask& Task)
{
	auto OnChanged = [WeakThis = WeakSelf]()
	{
		if (TSharedPtr<SGuidonTasksWindow> PinnedThis = WeakThis.Pin())
		{
			PinnedThis->LoadTasks();
		}
	};

	// Passes the already-loaded Tasks so the detail window can filter its
	// own subtasks locally - matches OpenForTask(projectId, task,
	// allProjectTasks) in the real GuidonTaskDetailWindow.cs exactly
	// (confirmed by reading it, not assumed).
	OpenGuidonTaskDetailWindowForTask(Task, Tasks, OnChanged);
}

void SGuidonTasksWindow::HandleAddTaskClicked(const FString& Status)
{
	if (!SelectedProject.IsValid())
	{
		return;
	}

	auto OnChanged = [WeakThis = WeakSelf]()
	{
		if (TSharedPtr<SGuidonTasksWindow> PinnedThis = WeakThis.Pin())
		{
			PinnedThis->LoadTasks();
		}
	};

	// Matches OpenForNewTask(projectId, status) in the real
	// GuidonTaskDetailWindow.cs - the "+" button opens the full detail
	// window in create mode rather than an inline field (see
	// BuildAddTaskButton's own comment for why).
	OpenGuidonTaskDetailWindowForNewTask(SelectedProject->id, Status, OnChanged);
}

void SGuidonTasksWindow::HandleTaskDropped(const FString& TaskId, const FString& SourceStatus, const FString& DestStatus, int32 DropIndex)
{
	FGuidonTask* MovedTask = Tasks.FindByPredicate([&TaskId](const FGuidonTask& T) { return T.id == TaskId; });
	if (MovedTask == nullptr)
	{
		return;
	}

	TArray<FGuidonTask> DestColumn = TasksForStatus(DestStatus);
	const int32 InsertIndex = (DropIndex == INDEX_NONE) ? DestColumn.Num() : DropIndex;
	const float NewSortOrder = GuidonSortOrder::ForPosition(DestColumn, InsertIndex, TaskId);

	const bool bStatusChanged = SourceStatus != DestStatus;

	// Optimistic local update, reconciled by a full LoadTasks() if either
	// API call below fails - same "update now, correct on failure" flow
	// as the Unity plugin's own drag-and-drop commit.
	MovedTask->status = DestStatus;
	MovedTask->sort_order = NewSortOrder;
	RebuildContent();

	GuidonApiClient::UpdateSortOrder(TaskId, NewSortOrder,
		[this, TaskId, DestStatus, bStatusChanged](FGuidonResult<FGuidonTask> Result)
		{
			if (!Result.bOk)
			{
				ErrorMessage = Result.Error;
				LoadTasks();
				return;
			}

			if (bStatusChanged)
			{
				GuidonApiClient::SetTaskStatus(TaskId, DestStatus,
					[this](FGuidonResult<FGuidonTask> StatusResult)
					{
						if (!StatusResult.bOk)
						{
							ErrorMessage = StatusResult.Error;
							LoadTasks();
						}
					});
			}
		});
}

```

- [ ] **Step 5: Self-check**

`FGuidonTask* Tasks.FindByPredicate(...)` returning a raw pointer into the `TArray` is safe here only as long as nothing reallocates `Tasks` between finding `MovedTask` and writing through it two lines later (nothing does - no `Tasks.Add`/`Remove` happens in between). `INDEX_NONE` (UE's standard `-1` sentinel) is reused here as "drop landed past the end of the column" per this task's own `SGuidonColumnDropTarget::OnDrop` always passing it (matching the stated v1 non-goal of no drop-position-within-column beyond append-at-end). `SComboBox::OnSelectionChanged`'s real delegate signature is `(TSharedPtr<T>, ESelectInfo::Type)` - matches `HandleProjectSelected`'s signature exactly, needed since `SComboBox<TSharedPtr<FGuidonProject>>` was declared with that same template argument in `BuildTopBar`. Confirm `FOnGuidonTaskClicked::CreateSP(this, &SGuidonTasksWindow::HandleTaskClicked)` compiles against `SLATE_EVENT(FOnGuidonTaskClicked, OnClicked)` in `SGuidonTaskCard.h` (Task 9) - `CreateSP` requires `this` to be `TSharedFromThis`-derived or a `SWidget` (which `SCompoundWidget` already is via its own base), so no extra inheritance is needed here.

- [ ] **Step 6: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/SGuidonTasksWindow.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/SGuidonTasksWindow.cpp
git commit -m "Add SGuidonTasksWindow: the Kanban board (login, columns, drag-and-drop, task creation)"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 11: SGuidonTaskDetailWindow (task detail/edit floating window)

**Files:**
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/SGuidonTaskDetailWindow.h`
- Create: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/SGuidonTaskDetailWindow.cpp`

**Before writing:** re-read `plugins/unity/GuidonTasks/Editor/GuidonTaskDetailWindow.cs` in full (514 lines - already read through line ~260 while planning this task; read the remainder, especially `Submit()`'s validation/branching, `BuildSubtasksSection`/`RebuildSubtasks`, and `BuildCommentsSection`/`RefreshComments`, before writing). Two open modes, matching Unity's two static entry points exactly (confirmed by reading, not assumed): **edit mode** (`OpenForTask` - status dropdown, delete button, Copy Git ref, subtasks section, comments section all present) and **new-task mode** (`OpenForNewTask` - none of those five, just title/description/priority/due-date + a single Create button). Unity's `EditorWindow.ShowUtility()` becomes UE's `SWindow` added via `FSlateApplication::Get().AddWindow(...)` - the direct equivalent floating-utility-window mechanism.

- [ ] **Step 1: Write the header**

```cpp
// SGuidonTaskDetailWindow.h
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "GuidonModels.h"

class SGuidonTaskDetailWindow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonTaskDetailWindow) {}
		/** Unset (TOptional) means "new task" mode. */
		SLATE_ARGUMENT(TOptional<FGuidonTask>, ExistingTask)
		SLATE_ARGUMENT(FString, ProjectId)
		/** Only meaningful in new-task mode - the column the task is created into. */
		SLATE_ARGUMENT(FString, NewTaskStatus)
		/** Only meaningful in edit mode - filtered locally by parent_task_id, same as OpenForTask's allProjectTasks param. */
		SLATE_ARGUMENT(TArray<FGuidonTask>, AllProjectTasks)
		SLATE_EVENT(FSimpleDelegate, OnChanged)
		SLATE_EVENT(FSimpleDelegate, OnRequestClose)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	bool IsEditMode() const { return ExistingTask.IsSet(); }

	TSharedRef<SWidget> BuildDescriptionField();
	TSharedRef<SWidget> BuildStatusRow();
	TSharedRef<SWidget> BuildActionButtons();
	TSharedRef<SWidget> BuildSubtasksSection();
	TSharedRef<SWidget> BuildCommentsSection();
	void RefreshSubtaskList();
	void RefreshCommentList();

	void HandleToggleDescriptionPreview();
	void HandleSubmit();
	void HandleDelete();
	void HandleStatusChanged(TSharedPtr<FString> NewStatusLabel, ESelectInfo::Type SelectInfo);
	void HandleAddSubtask(const FText& Title, ETextCommit::Type CommitType);
	void HandleAddComment();
	void ShowStatusMessage(const FString& Message);

	TOptional<FGuidonTask> ExistingTask;
	FString ProjectId;
	FString NewTaskStatus;
	TArray<FGuidonTask> AllProjectTasks;
	FSimpleDelegate OnChangedDelegate;
	FSimpleDelegate OnRequestCloseDelegate;

	TSharedPtr<class SEditableTextBox> TitleBox;
	TSharedPtr<class SMultiLineEditableTextBox> DescriptionEditBox;
	TSharedPtr<class SRichTextBlock> DescriptionPreviewBlock;
	TSharedPtr<class SWidgetSwitcher> DescriptionSwitcher;
	TSharedPtr<class SButton> DescriptionToggleButton;
	TSharedPtr<class SComboBox<TSharedPtr<FString>>> PriorityCombo;
	TSharedPtr<FString> SelectedPriority;
	TArray<TSharedPtr<FString>> PriorityOptions;
	TSharedPtr<class SEditableTextBox> DueDateBox;
	TSharedPtr<class SComboBox<TSharedPtr<FString>>> StatusCombo;
	TArray<TSharedPtr<FString>> StatusOptions;
	TSharedPtr<class STextBlock> StatusMessageBlock;
	TSharedPtr<class SVerticalBox> SubtaskListBox;
	TSharedPtr<class SVerticalBox> CommentListBox;
	TSharedPtr<class SEditableTextBox> NewCommentBox;
	bool bPreviewingDescription = false;
};

/** Matches GuidonTaskDetailWindow.OpenForTask - opens in edit mode for an existing task. */
void OpenGuidonTaskDetailWindowForTask(const FGuidonTask& Task, const TArray<FGuidonTask>& AllProjectTasks, TFunction<void()> OnChanged);

/** Matches GuidonTaskDetailWindow.OpenForNewTask - opens in create mode for a brand-new top-level task in the given column. */
void OpenGuidonTaskDetailWindowForNewTask(const FString& ProjectId, const FString& Status, TFunction<void()> OnChanged);
```

- [ ] **Step 2: Write Construct and the description field (preview toggle, matching Unity's `ToggleDescriptionPreview` exactly)**

```cpp
// SGuidonTaskDetailWindow.cpp (part 1 of 3)
#include "SGuidonTaskDetailWindow.h"
#include "GuidonApiClient.h"
#include "GuidonStyles.h"
#include "GuidonMarkdown.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWidgetSwitcher.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Text/SRichTextBlock.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SMultiLineEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SComboBox.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/PlatformApplicationMisc.h"

namespace
{
	TSharedRef<SWidget> LabeledField(const FString& Label, TSharedRef<SWidget> Field)
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(FMargin(0.f, 6.f, 0.f, 2.f))
			[
				SNew(STextBlock).Text(FText::FromString(Label)).ColorAndOpacity(FGuidonStyles::MutedTextColor())
			]
			+ SVerticalBox::Slot()
			.AutoHeight()
			[
				Field
			];
	}
}

void SGuidonTaskDetailWindow::Construct(const FArguments& InArgs)
{
	ExistingTask = InArgs._ExistingTask;
	ProjectId = InArgs._ProjectId;
	NewTaskStatus = InArgs._NewTaskStatus;
	AllProjectTasks = InArgs._AllProjectTasks;
	OnChangedDelegate = InArgs._OnChanged;
	OnRequestCloseDelegate = InArgs._OnRequestClose;

	for (const FString& Priority : GuidonVocabulary::Priorities)
	{
		PriorityOptions.Add(MakeShared<FString>(Priority));
	}
	const FString InitialPriority = IsEditMode() ? ExistingTask->priority : TEXT("medium");
	SelectedPriority = *PriorityOptions.FindByPredicate([&InitialPriority](const TSharedPtr<FString>& P) { return *P == InitialPriority; });

	for (int32 Index = 0; Index < GuidonVocabulary::Statuses.Num(); ++Index)
	{
		StatusOptions.Add(MakeShared<FString>(GuidonVocabulary::Statuses[Index]));
	}

	TSharedRef<SScrollBox> Scroll = SNew(SScrollBox);

	Scroll->AddSlot()
		[
			SAssignNew(TitleBox, SEditableTextBox)
			.Text(FText::FromString(IsEditMode() ? ExistingTask->title : FString()))
			.HintText(FText::FromString(TEXT("Title")))
		];

	Scroll->AddSlot()[BuildDescriptionField()];

	Scroll->AddSlot()
		[
			LabeledField(TEXT("Priority"),
				SAssignNew(PriorityCombo, SComboBox<TSharedPtr<FString>>)
				.OptionsSource(&PriorityOptions)
				.InitiallySelectedItem(SelectedPriority)
				.OnSelectionChanged_Lambda([this](TSharedPtr<FString> NewValue, ESelectInfo::Type) { SelectedPriority = NewValue; })
				.OnGenerateWidget_Lambda([](TSharedPtr<FString> Value) { return SNew(STextBlock).Text(FText::FromString(*Value)); })
				[
					SNew(STextBlock).Text_Lambda([this]() { return FText::FromString(SelectedPriority.IsValid() ? *SelectedPriority : FString()); })
				])
		];

	const FString InitialDueDate = IsEditMode() && !ExistingTask->due_date.IsEmpty()
		? [this]() { FDateTime Parsed; return FDateTime::ParseIso8601(*ExistingTask->due_date, Parsed) ? Parsed.ToString(TEXT("%Y-%m-%d")) : FString(); }()
		: FString();

	Scroll->AddSlot()
		[
			LabeledField(TEXT("Due date (yyyy-MM-dd)"),
				SAssignNew(DueDateBox, SEditableTextBox).Text(FText::FromString(InitialDueDate)))
		];

	if (IsEditMode())
	{
		Scroll->AddSlot()[BuildStatusRow()];
	}

	Scroll->AddSlot()[BuildActionButtons()];

	Scroll->AddSlot()
		[
			SAssignNew(StatusMessageBlock, STextBlock)
			.Visibility(EVisibility::Collapsed)
			.ColorAndOpacity(FLinearColor(1.f, 0.4f, 0.4f))
		];

	if (IsEditMode())
	{
		Scroll->AddSlot()[BuildSubtasksSection()];
		Scroll->AddSlot()[BuildCommentsSection()];
		RefreshSubtaskList();
		RefreshCommentList();
	}

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FGuidonStyles::WindowBackground())
		.Padding(FMargin(8.f))
		[
			Scroll
		]
	];
}

TSharedRef<SWidget> SGuidonTaskDetailWindow::BuildDescriptionField()
{
	const FString InitialDescription = IsEditMode() ? ExistingTask->description : FString();

	return SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot()
			.FillWidth(1.f)
			.VAlign(VAlign_Center)
			[
				SNew(STextBlock).Text(FText::FromString(TEXT("Description"))).ColorAndOpacity(FGuidonStyles::MutedTextColor())
			]
			+ SHorizontalBox::Slot()
			.AutoWidth()
			[
				SAssignNew(DescriptionToggleButton, SButton)
				.Text(FText::FromString(TEXT("Preview")))
				.OnClicked_Lambda([this]() { HandleToggleDescriptionPreview(); return FReply::Handled(); })
			]
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SAssignNew(DescriptionSwitcher, SWidgetSwitcher)
			+ SWidgetSwitcher::Slot()
			[
				SAssignNew(DescriptionEditBox, SMultiLineEditableTextBox)
				.Text(FText::FromString(InitialDescription))
			]
			+ SWidgetSwitcher::Slot()
			[
				SAssignNew(DescriptionPreviewBlock, SRichTextBlock)
				.DecoratorStyleSet(&FGuidonStyles::Get())
				.TextStyle(&FGuidonStyles::Get().GetWidgetStyle<FTextBlockStyle>(TEXT("Guidon.NormalText")))
				.AutoWrapText(true)
			]
		];
}

void SGuidonTaskDetailWindow::HandleToggleDescriptionPreview()
{
	bPreviewingDescription = !bPreviewingDescription;
	DescriptionSwitcher->SetActiveWidgetIndex(bPreviewingDescription ? 1 : 0);
	DescriptionToggleButton->SetContent(SNew(STextBlock).Text(FText::FromString(bPreviewingDescription ? TEXT("Edit") : TEXT("Preview"))));

	if (bPreviewingDescription)
	{
		const FString Content = DescriptionEditBox->GetText().IsEmpty() ? TEXT("(no description)") : DescriptionEditBox->GetText().ToString();
		DescriptionPreviewBlock->SetText(FText::FromString(GuidonMarkdown::ToRichText(Content)));
	}
}
```

- [ ] **Step 3: Write the status row and action buttons (submit/delete/copy-git-ref/close)**

**One deliberate scope simplification, stated plainly:** Unity's `BuildStatusDropdown` limits choices to the *project's configured visible columns* (`GuidonVocabulary.CurrentColumns`, which the Unity plugin loads separately - not covered anywhere else in this plan). This port offers all six `GuidonVocabulary::Statuses` instead, always - simpler, and the server-side RLS/validation already accepts any of them regardless of a project's column visibility config, so this only affects whether a hidden column shows up as a choice here, never correctness.

```cpp
// SGuidonTaskDetailWindow.cpp (part 2 of 3)

TSharedRef<SWidget> SGuidonTaskDetailWindow::BuildStatusRow()
{
	const FString InitialStatus = ExistingTask->status;
	TSharedPtr<FString> InitialSelection = *StatusOptions.FindByPredicate([&InitialStatus](const TSharedPtr<FString>& S) { return *S == InitialStatus; });

	return LabeledField(TEXT("Status"),
		SAssignNew(StatusCombo, SComboBox<TSharedPtr<FString>>)
		.OptionsSource(&StatusOptions)
		.InitiallySelectedItem(InitialSelection)
		.OnSelectionChanged(this, &SGuidonTaskDetailWindow::HandleStatusChanged)
		.OnGenerateWidget_Lambda([](TSharedPtr<FString> Value) { return SNew(STextBlock).Text(FText::FromString(GuidonVocabulary::StatusLabel(*Value))); })
		[
			SNew(STextBlock).Text_Lambda([this]()
			{
				return FText::FromString(GuidonVocabulary::StatusLabel(ExistingTask.IsSet() ? ExistingTask->status : FString()));
			})
		]);
}

void SGuidonTaskDetailWindow::HandleStatusChanged(TSharedPtr<FString> NewStatusLabel, ESelectInfo::Type SelectInfo)
{
	if (!NewStatusLabel.IsValid() || !ExistingTask.IsSet() || *NewStatusLabel == ExistingTask->status)
	{
		return;
	}

	const FString TaskId = ExistingTask->id;
	const FString NewStatus = *NewStatusLabel;
	ShowStatusMessage(FString());

	GuidonApiClient::SetTaskStatus(TaskId, NewStatus,
		[this, NewStatus](FGuidonResult<FGuidonTask> Result)
		{
			if (!Result.bOk)
			{
				ShowStatusMessage(Result.Error);
				return;
			}
			ExistingTask = Result.Value;
			if (OnChangedDelegate.IsBound())
			{
				OnChangedDelegate.Execute();
			}
		});
}

TSharedRef<SWidget> SGuidonTaskDetailWindow::BuildActionButtons()
{
	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);

	Row->AddSlot()
		.AutoWidth()
		.Padding(FMargin(0.f, 6.f, 4.f, 0.f))
		[
			SNew(SButton)
			.Text(FText::FromString(IsEditMode() ? TEXT("Save") : TEXT("Create")))
			.OnClicked_Lambda([this]() { HandleSubmit(); return FReply::Handled(); })
		];

	if (IsEditMode())
	{
		Row->AddSlot()
			.AutoWidth()
			.Padding(FMargin(0.f, 6.f, 4.f, 0.f))
			[
				SNew(SButton)
				.Text(FText::FromString(TEXT("Delete")))
				.OnClicked_Lambda([this]() { HandleDelete(); return FReply::Handled(); })
			];

		// guidon#1a2b3c4d - what the GitHub integration recognises in
		// commits, PRs and branch names. Matches Unity's copy-ref button
		// exactly (first 8 chars of the task id, lowercased).
		const FString GitRef = TEXT("guidon#") + ExistingTask->id.Left(FMath::Min(8, ExistingTask->id.Len())).ToLower();
		Row->AddSlot()
			.AutoWidth()
			.Padding(FMargin(0.f, 6.f, 4.f, 0.f))
			[
				SNew(SButton)
				.Text(FText::FromString(TEXT("Copy Git ref")))
				.ToolTipText(FText::FromString(TEXT("Copy guidon#<id>: mention it in a commit, PR or branch name and the GitHub integration links and moves this task")))
				.OnClicked_Lambda([GitRef]() { FPlatformApplicationMisc::ClipboardCopy(*GitRef); return FReply::Handled(); })
			];
	}

	Row->AddSlot()
		.AutoWidth()
		.Padding(FMargin(0.f, 6.f, 0.f, 0.f))
		[
			SNew(SButton)
			.Text(FText::FromString(TEXT("Close")))
			.OnClicked_Lambda([this]()
			{
				if (OnRequestCloseDelegate.IsBound()) OnRequestCloseDelegate.Execute();
				return FReply::Handled();
			})
		];

	return Row;
}

void SGuidonTaskDetailWindow::ShowStatusMessage(const FString& Message)
{
	StatusMessageBlock->SetText(FText::FromString(Message));
	StatusMessageBlock->SetVisibility(Message.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible);
}

void SGuidonTaskDetailWindow::HandleSubmit()
{
	const FString Title = TitleBox->GetText().ToString();
	if (Title.TrimStartAndEnd().IsEmpty())
	{
		ShowStatusMessage(TEXT("Title is required."));
		return;
	}

	const FString Priority = SelectedPriority.IsValid() ? *SelectedPriority : TEXT("medium");
	const FString DueDateInput = DueDateBox->GetText().ToString();

	FString DueDateIso;
	if (!DueDateInput.TrimStartAndEnd().IsEmpty())
	{
		FDateTime ParsedDate;
		if (!FDateTime::Parse(DueDateInput, ParsedDate))
		{
			ShowStatusMessage(FString::Printf(TEXT("Due date \"%s\" isn't a valid date - use yyyy-MM-dd."), *DueDateInput));
			return;
		}
		DueDateIso = ParsedDate.ToIso8601();
	}

	const FString Description = DescriptionEditBox->GetText().ToString();
	ShowStatusMessage(FString());

	if (IsEditMode())
	{
		GuidonApiClient::UpdateTaskFields(ExistingTask->id, Title, Description, Priority, DueDateIso,
			[this](FGuidonResult<FGuidonTask> Result)
			{
				if (!Result.bOk)
				{
					ShowStatusMessage(Result.Error);
					return;
				}
				if (OnChangedDelegate.IsBound()) OnChangedDelegate.Execute();
				if (OnRequestCloseDelegate.IsBound()) OnRequestCloseDelegate.Execute();
			});
	}
	else
	{
		GuidonApiClient::CreateTask(ProjectId, Title, Description, Priority, DueDateIso, FString(), NewTaskStatus,
			[this](FGuidonResult<FGuidonTask> Result)
			{
				if (!Result.bOk)
				{
					ShowStatusMessage(Result.Error);
					return;
				}
				if (OnChangedDelegate.IsBound()) OnChangedDelegate.Execute();
				if (OnRequestCloseDelegate.IsBound()) OnRequestCloseDelegate.Execute();
			});
	}
}

void SGuidonTaskDetailWindow::HandleDelete()
{
	if (!IsEditMode())
	{
		return;
	}

	GuidonApiClient::DeleteTask(ExistingTask->id,
		[this](FGuidonResult<bool> Result)
		{
			if (!Result.bOk)
			{
				ShowStatusMessage(Result.Error);
				return;
			}
			if (OnChangedDelegate.IsBound()) OnChangedDelegate.Execute();
			if (OnRequestCloseDelegate.IsBound()) OnRequestCloseDelegate.Execute();
		});
}
```

- [ ] **Step 4: Write the subtasks section, comments section, and the two module-level Open functions**

Subtasks are filtered from the `AllProjectTasks` snapshot passed in at open time (matching `OpenForTask`'s `allProjectTasks` parameter exactly - no separate fetch). Adding a subtask re-fetches the whole project's tasks via `GuidonApiClient::ListTasks` to pick it up, since `AllProjectTasks` is otherwise a point-in-time snapshot. Comments have their own dedicated `ListComments`/`AddComment` calls (Task 5), matching Unity's `RefreshComments`/`AddComment` flow.

```cpp
// SGuidonTaskDetailWindow.cpp (part 3 of 3)

TSharedRef<SWidget> SGuidonTaskDetailWindow::BuildSubtasksSection()
{
	TSharedRef<SEditableTextBox> NewSubtaskBox = SNew(SEditableTextBox)
		.HintText(FText::FromString(TEXT("+ New subtask")));
	NewSubtaskBox->SetOnTextCommitted(FOnTextCommitted::CreateSP(this, &SGuidonTaskDetailWindow::HandleAddSubtask));

	return SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(FMargin(0.f, 10.f, 0.f, 2.f))
		[
			SNew(STextBlock).Text(FText::FromString(TEXT("Subtasks"))).ColorAndOpacity(FGuidonStyles::MutedTextColor())
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SAssignNew(SubtaskListBox, SVerticalBox)
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(FMargin(0.f, 4.f, 0.f, 0.f))
		[
			NewSubtaskBox
		];
}

void SGuidonTaskDetailWindow::RefreshSubtaskList()
{
	SubtaskListBox->ClearChildren();

	const FString ParentId = ExistingTask->id;
	for (const FGuidonTask& Task : AllProjectTasks)
	{
		if (Task.parent_task_id != ParentId)
		{
			continue;
		}

		SubtaskListBox->AddSlot()
			.AutoHeight()
			.Padding(FMargin(0.f, 1.f))
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot()
				.FillWidth(1.f)
				[
					SNew(STextBlock).Text(FText::FromString(Task.title)).ColorAndOpacity(FGuidonStyles::TextColor())
				]
				+ SHorizontalBox::Slot()
				.AutoWidth()
				[
					SNew(STextBlock).Text(FText::FromString(GuidonVocabulary::StatusLabel(Task.status))).ColorAndOpacity(FGuidonStyles::MutedTextColor())
				]
			];
	}
}

void SGuidonTaskDetailWindow::HandleAddSubtask(const FText& Title, ETextCommit::Type CommitType)
{
	if (CommitType != ETextCommit::OnEnter || Title.IsEmptyOrWhitespace() || !ExistingTask.IsSet())
	{
		return;
	}

	GuidonApiClient::CreateTask(ProjectId, Title.ToString(), FString(), FString(), FString(), ExistingTask->id, FString(),
		[this](FGuidonResult<FGuidonTask> Result)
		{
			if (!Result.bOk)
			{
				ShowStatusMessage(Result.Error);
				return;
			}

			GuidonApiClient::ListTasks(ProjectId,
				[this](FGuidonResult<TArray<FGuidonTask>> ListResult)
				{
					if (ListResult.bOk)
					{
						AllProjectTasks = ListResult.Value;
						RefreshSubtaskList();
					}
					if (OnChangedDelegate.IsBound()) OnChangedDelegate.Execute();
				});
		});
}

TSharedRef<SWidget> SGuidonTaskDetailWindow::BuildCommentsSection()
{
	return SNew(SVerticalBox)
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(FMargin(0.f, 10.f, 0.f, 2.f))
		[
			SNew(STextBlock).Text(FText::FromString(TEXT("Comments"))).ColorAndOpacity(FGuidonStyles::MutedTextColor())
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SAssignNew(CommentListBox, SVerticalBox)
		]
		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(FMargin(0.f, 4.f, 0.f, 0.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot()
			.FillWidth(1.f)
			[
				SAssignNew(NewCommentBox, SEditableTextBox).HintText(FText::FromString(TEXT("Add a comment...")))
			]
			+ SHorizontalBox::Slot()
			.AutoWidth()
			[
				SNew(SButton)
				.Text(FText::FromString(TEXT("Post")))
				.OnClicked_Lambda([this]() { HandleAddComment(); return FReply::Handled(); })
			]
		];
}

void SGuidonTaskDetailWindow::RefreshCommentList()
{
	GuidonApiClient::ListComments(ExistingTask->id,
		[this](FGuidonResult<TArray<FGuidonComment>> Result)
		{
			if (!Result.bOk || !CommentListBox.IsValid())
			{
				return;
			}

			CommentListBox->ClearChildren();
			for (const FGuidonComment& Comment : Result.Value)
			{
				CommentListBox->AddSlot()
					.AutoHeight()
					.Padding(FMargin(0.f, 2.f))
					[
						SNew(SVerticalBox)
						+ SVerticalBox::Slot()
						.AutoHeight()
						[
							SNew(STextBlock)
							.Text(FText::FromString(!Comment.actor_label.IsEmpty() ? Comment.actor_label : Comment.author_id))
							.ColorAndOpacity(FGuidonStyles::MutedTextColor())
							.Font(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"), 8))
						]
						+ SVerticalBox::Slot()
						.AutoHeight()
						[
							SNew(STextBlock)
							.Text(FText::FromString(Comment.content))
							.ColorAndOpacity(FGuidonStyles::TextColor())
							.AutoWrapText(true)
						]
					];
			}
		});
}

void SGuidonTaskDetailWindow::HandleAddComment()
{
	if (!ExistingTask.IsSet() || NewCommentBox->GetText().IsEmptyOrWhitespace())
	{
		return;
	}

	const FString Content = NewCommentBox->GetText().ToString();
	GuidonApiClient::AddComment(ExistingTask->id, Content,
		[this](FGuidonResult<FGuidonComment> Result)
		{
			if (!Result.bOk)
			{
				ShowStatusMessage(Result.Error);
				return;
			}
			NewCommentBox->SetText(FText::GetEmpty());
			RefreshCommentList();
		});
}

namespace
{
	TSharedRef<SWindow> OpenDetailWindow(const FText& Title)
	{
		TSharedRef<SWindow> Window = SNew(SWindow)
			.Title(Title)
			.ClientSize(FVector2D(400.f, 480.f))
			.SupportsMaximize(false)
			.SupportsMinimize(false);

		FSlateApplication::Get().AddWindow(Window);
		return Window;
	}
}

void OpenGuidonTaskDetailWindowForTask(const FGuidonTask& Task, const TArray<FGuidonTask>& AllProjectTasks, TFunction<void()> OnChanged)
{
	TSharedRef<SWindow> Window = OpenDetailWindow(FText::FromString(Task.title));
	TWeakPtr<SWindow> WeakWindow = Window;

	Window->SetContent(
		SNew(SGuidonTaskDetailWindow)
		.ExistingTask(Task)
		.ProjectId(Task.project_id)
		.AllProjectTasks(AllProjectTasks)
		.OnChanged(FSimpleDelegate::CreateLambda([OnChanged]() { OnChanged(); }))
		.OnRequestClose(FSimpleDelegate::CreateLambda([WeakWindow]()
		{
			if (TSharedPtr<SWindow> Pinned = WeakWindow.Pin()) Pinned->RequestDestroyWindow();
		})));
}

void OpenGuidonTaskDetailWindowForNewTask(const FString& ProjectId, const FString& Status, TFunction<void()> OnChanged)
{
	TSharedRef<SWindow> Window = OpenDetailWindow(FText::FromString(TEXT("New Task")));
	TWeakPtr<SWindow> WeakWindow = Window;

	Window->SetContent(
		SNew(SGuidonTaskDetailWindow)
		.ProjectId(ProjectId)
		.NewTaskStatus(Status)
		.OnChanged(FSimpleDelegate::CreateLambda([OnChanged]() { OnChanged(); }))
		.OnRequestClose(FSimpleDelegate::CreateLambda([WeakWindow]()
		{
			if (TSharedPtr<SWindow> Pinned = WeakWindow.Pin()) Pinned->RequestDestroyWindow();
		})));
}
```

- [ ] **Step 5: Self-check**

`SLATE_ARGUMENT(TOptional<FGuidonTask>, ExistingTask)` being unset is the "new task" mode discriminator, matching Unity's `_task == null` check exactly. `SWindow` created via `SNew(SWindow)` and shown with `FSlateApplication::Get().AddWindow(Window)` (not `AddModalWindow`, matching Unity's non-modal `ShowUtility()`) is the real, standard way to open a floating Editor utility window from arbitrary code (not requiring a parent `EditorWindow`/tab context) - `Window->SetContent(...)` after construction (rather than passing content inline to `SNew(SWindow)`) is done here specifically so the content widget's own `OnRequestClose` delegate can capture a `TWeakPtr` to the window it lives inside, which isn't available before the window exists. `SWidgetSwitcher::SetActiveWidgetIndex` and `.DecoratorStyleSet(&FGuidonStyles::Get())` on `SRichTextBlock` are both real, stable, documented Slate APIs. `FDateTime::Parse`/`ParseIso8601`/`ToIso8601` are real `FDateTime` static/member functions present since UE4. `FPlatformApplicationMisc::ClipboardCopy` is the real, cross-platform clipboard API (replaces Unity's `EditorGUIUtility.systemCopyBuffer` assignment). Cross-check `HandleSubmit`'s branching (edit mode -> `UpdateTaskFields`, new-task mode -> `CreateTask` with `NewTaskStatus`) and the "one deliberate scope simplification" callout (all six statuses offered, not just a project's visible columns) against the real `Submit()`/`BuildStatusDropdown()` in `GuidonTaskDetailWindow.cs` re-read at this task's start.

- [ ] **Step 6: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/SGuidonTaskDetailWindow.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/SGuidonTaskDetailWindow.cpp
git commit -m "Add SGuidonTaskDetailWindow: task detail/create window with subtasks and comments"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 12: Module wiring (Window menu entry, style lifecycle)

**Files:**
- Modify: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonTasksModule.h`
- Modify: `plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonTasksModule.cpp`

Wires everything built in Tasks 2-11 into the Editor: registers a tab spawner so `Window > Guidon Tasks` opens `SGuidonTasksWindow` in a dockable tab, and manages `FGuidonStyles`'s lifecycle (`Initialize`/`Shutdown` must bracket the module's own lifetime, since every widget built in Tasks 8-11 depends on the style set already being registered).

- [ ] **Step 1: Update the header - add the tab-spawning method**

```cpp
// GuidonTasksModule.h
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FGuidonTasksModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	TSharedRef<class SDockTab> OnSpawnTasksTab(const class FSpawnTabArgs& Args);

	static const FName TasksTabName;
};
```

(`RegisterMenus`/`OnTasksWindowTabClosed` from Task 1's scaffold are removed - a nomad tab spawner registered with `SetMenuType(ETabSpawnerMenuType::Enabled)` already adds its own `Window` menu entry automatically, no separate menu-registration code needed, and nothing needs to run specifically on tab close.)

- [ ] **Step 2: Update the implementation**

```cpp
// GuidonTasksModule.cpp
#include "GuidonTasksModule.h"
#include "GuidonStyles.h"
#include "SGuidonTasksWindow.h"
#include "Widgets/Docking/SDockTab.h"
#include "Framework/Docking/TabManager.h"
#include "WorkspaceMenuStructure.h"
#include "WorkspaceMenuStructureModule.h"

const FName FGuidonTasksModule::TasksTabName(TEXT("GuidonTasks"));

void FGuidonTasksModule::StartupModule()
{
	FGuidonStyles::Initialize();

	FGlobalTabmanager::Get()->RegisterNomadTabSpawner(
		TasksTabName,
		FOnSpawnTab::CreateRaw(this, &FGuidonTasksModule::OnSpawnTasksTab))
		.SetDisplayName(NSLOCTEXT("GuidonTasks", "TabTitle", "Guidon Tasks"))
		.SetTooltipText(NSLOCTEXT("GuidonTasks", "TabTooltip", "View and manage your Guidon project tasks"))
		.SetMenuType(ETabSpawnerMenuType::Enabled)
		.SetGroup(WorkspaceMenu::GetMenuStructure().GetToolsCategory());
}

void FGuidonTasksModule::ShutdownModule()
{
	if (FSlateApplication::IsInitialized())
	{
		FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(TasksTabName);
	}
	FGuidonStyles::Shutdown();
}

TSharedRef<SDockTab> FGuidonTasksModule::OnSpawnTasksTab(const FSpawnTabArgs& Args)
{
	return SNew(SDockTab)
		.TabRole(ETabRole::NomadTab)
		[
			SNew(SGuidonTasksWindow)
		];
}

IMPLEMENT_MODULE(FGuidonTasksModule, GuidonTasks)
```

- [ ] **Step 3: Add `WorkspaceMenuStructure` to the module's dependencies**

In `GuidonTasks.Build.cs` (Task 1), add `"WorkspaceMenuStructure"` to the `PrivateDependencyModuleNames` array (needed for `WorkspaceMenu::GetMenuStructure()`, not included by the modules already listed there).

- [ ] **Step 4: Self-check**

`FGlobalTabmanager::Get()->RegisterNomadTabSpawner(FName, FOnSpawnTab)` returning an `FTabSpawnerEntry&` you chain `.SetDisplayName`/`.SetTooltipText`/`.SetMenuType`/`.SetGroup` onto is the real, standard pattern every UE Editor plugin with a dockable tool window uses (e.g. this is structurally identical to how the engine's own `LevelEditor`/`ContentBrowser` modules register their tabs, just via a plugin module instead of an engine module) - not invented for this plan. `WorkspaceMenu::GetMenuStructure().GetToolsCategory()` places the menu entry in `Window > Tools Category` submenu (or directly under `Window` depending on engine version's exact menu layout) rather than cluttering the top level - a real, commonly-used category, though the EXACT submenu placement is worth a glance once compiled since UE's `Window` menu categorization has shifted slightly across 5.x versions. `FSlateApplication::IsInitialized()` guarding the `ShutdownModule` unregister call matters because module shutdown can happen during Editor exit after Slate itself has already torn down - calling `FGlobalTabmanager::Get()` after that point would crash, so this guard (a real, commonly-seen pattern in UE plugin `ShutdownModule` implementations) is not optional. `PostEngineInit` (Task 1's chosen `LoadingPhase`) guarantees `FGlobalTabmanager::Get()` is already valid by the time `StartupModule` runs.

- [ ] **Step 5: Commit**

```bash
git add plugins/unreal/GuidonTasks/Source/GuidonTasks/Public/GuidonTasksModule.h plugins/unreal/GuidonTasks/Source/GuidonTasks/Private/GuidonTasksModule.cpp plugins/unreal/GuidonTasks/Source/GuidonTasks/GuidonTasks.Build.cs
git commit -m "Wire GuidonTasksWindow into the Editor's Window menu as a dockable tab"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 13: README + manual verification checklist

**Files:**
- Create: `plugins/unreal/GuidonTasks/README.md`

The plugin has no automated tests and cannot be compiled in this environment (stated at the top of this plan). This task's deliverable is the document the user runs through by hand once they've compiled it into a real UE 5.7 project - the equivalent of every other feature this session ending in a real browser/PGlite verification pass, adapted to the one case where that mechanism doesn't exist.

- [ ] **Step 1: Write the README**

```markdown
# Guidon Tasks - Unreal Engine plugin

View and manage your Guidon project tasks from inside the Unreal Editor - the Unreal Engine 5.7 counterpart to `plugins/unity/GuidonTasks/`, ported feature-for-feature: browser-based login, a Kanban board with drag-and-drop, task CRUD, subtasks, Markdown description preview, comments.

## Installation

Copy `plugins/unreal/GuidonTasks/` into your Unreal project's own `Plugins/` folder (creating that folder if it doesn't already exist), then open the project - Unreal will offer to build the plugin's C++ module. Requires Visual Studio (Windows) or Xcode (Mac) with UE 5.7's build tools installed, since this is a C++ plugin, not a Blueprint-only one.

## First-time setup

**Known limitation, stated plainly:** this plugin was written without a local Unreal Engine installation to compile against. It has NOT been built or run before reaching you. Expect to fix compiler errors on first build - report them back for a fix pass. This is the deliberate, planned trade-off explained in this plugin's own implementation plan (`docs/superpowers/plans/2026-09-23-unreal-plugin.md` in the main Guidon repo), not a quality shortfall.

1. Open `Window > Guidon Tasks` in the Unreal Editor.
2. Click **Log in with Guidon** - your system browser opens to the real Guidon login page. Log in there (same account as the web app).
3. Approve the plugin login prompt. The Editor tab updates automatically once you do.

## Manual verification checklist

Run through this once after your own first successful compile - each line should be independently checkable, no automated test suite exists for this plugin:

- [ ] `Window > Guidon Tasks` opens a dockable tab (not a floating window) titled "Guidon Tasks".
- [ ] With no saved login, the tab shows a "Log in with Guidon" button and no board.
- [ ] Clicking it opens your system's default browser to `{base URL}/auth/plugin-login?...`.
- [ ] After approving in the browser, the Unreal tab automatically switches to the board view within a few seconds (no manual refresh needed) - **this is the plan's single highest-risk area (Task 6's self-check); if login never completes, check whether the local HTTPServer listener actually bound a port**.
- [ ] The project dropdown lists your real Guidon projects; selecting one loads that project's tasks into six columns (Backlog/Todo/In Progress/AI Working/Review/Done).
- [ ] Each column's colored accent bar and each card's priority dot use colors that look like the real site's dark theme, not arbitrary engine defaults.
- [ ] Clicking a card opens its detail window with the real title/description/priority/due date/status/subtasks/comments.
- [ ] Editing the title/description/priority/due date and clicking Save persists (reload the tab / reopen the card to confirm it stuck).
- [ ] Toggling the description field's Preview button renders **bold**, *italic*, `inline code`, a bullet list, and a `# Header` distinctly from each other and from plain text.
- [ ] Changing the Status dropdown in the detail window updates the task immediately (check it moved to the new column after closing the window).
- [ ] Dragging a card from one column and dropping it in another actually moves it (both visually and confirmed after a Refresh, proving the server-side write happened, not just local state).
- [ ] Dragging a card within its own column doesn't crash and the task keeps a sensible position after a Refresh.
- [ ] Clicking a column's "+" button opens the detail window in "New Task" mode (title/description/priority/due date only, a single Create button, no Delete/subtasks/comments); creating one adds it to that column.
- [ ] Adding a subtask from an existing task's detail window makes it appear in that task's subtask list.
- [ ] Posting a comment appears in the comment list without needing to close and reopen the window.
- [ ] Deleting a task removes it from the board after a Refresh.
- [ ] "Copy Git ref" copies `guidon#<8-char-id-prefix>` to the clipboard (paste it somewhere to confirm).
- [ ] Log out returns to the logged-out view, and the API key is gone (closing and reopening the Guidon Tasks tab still shows the logged-out view, not a stale cached board).
- [ ] Closing and reopening the Editor preserves the login (matches `EditorPrefs`-equivalent machine-wide persistence, Task 3) - you should NOT need to log in again after an Editor restart.

## Known limitations (v1, matching the Unity plugin's own list)

No background auto-refresh - use the Refresh button. No within-column reorder by exact drop position (a drop always lands at the end of its column). No assignee/tags editing. Dark Editor theme only - if you run a light Unreal Editor theme, this plugin's colors will still look like the site's dark palette (see `GuidonStyles.cpp`'s own comment for why). Unreal Engine 5.7 minimum - not tested against earlier 5.x versions.
```

- [ ] **Step 2: Self-check**

Read back through this plan's own Non-goals section (spec, "Non-goals") and each task's own stated scope simplifications (Task 8's dark-mode-only palette, Task 10's append-only drop position, Task 11's all-statuses-not-just-visible-columns) - confirm every one of them is reflected in this README's "Known limitations" section so the user isn't surprised by a gap this plan already knew about and decided not to close.

- [ ] **Step 3: Commit**

```bash
git add plugins/unreal/GuidonTasks/README.md
git commit -m "Add GuidonTasks Unreal plugin README and manual verification checklist"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Self-Review

**Spec coverage:** every module in the spec's architecture table has its own task - Settings (3), Models (2), SortOrder (4), ApiClient (5), BrowserAuth (6), Markdown (7), Styles (8), TaskCard (9), TasksWindow (10), TaskDetailWindow (11), module wiring (12), README/checklist (13). Login flow (spec section "Login flow") is fully covered by Task 6 + Task 10's `HandleLoginClicked`/`HandleLogoutClicked`. UI section (Kanban board + detail window) covered by Tasks 9-11. Non-goals section is honored (no auto-refresh loop was written anywhere, no within-column reorder-by-exact-position logic beyond append-at-end, no assignee/tags fields in the detail window).

**Type consistency:** `FGuidonTask`/`FGuidonProject`/`FGuidonComment` (Task 2) are the only task/project/comment types used everywhere in Tasks 5, 9, 10, 11 - no duplicate or renamed struct appears later. `FGuidonResult<T>` (Task 5) is the one result type used by every `GuidonApiClient`/`GuidonBrowserAuth` async call site in Tasks 6, 10, 11. `GuidonVocabulary::Statuses`/`StatusLabels`/`Priorities`/`StatusLabel()` (Task 2) are the only vocabulary source used in Tasks 8, 9, 10, 11 - nothing hardcodes a second copy of the status list elsewhere. `OpenGuidonTaskDetailWindowForTask`/`OpenGuidonTaskDetailWindowForNewTask` (Task 11) are declared once and are the only two entry points Task 10 calls (`HandleTaskClicked`/`HandleAddTaskClicked`) - the plan's earlier draft briefly had a single-signature `OpenGuidonTaskDetailWindow` before the real Unity source was re-checked and found to have two distinct entry points (`OpenForTask`/`OpenForNewTask`); this was caught and fixed during writing, and every call site in this final version uses the corrected two-function form consistently.

**Placeholder scan:** every step has real, complete C++ - no "TBD"/"add error handling"/"similar to Task N" shortcuts. The one recurring exception, stated as policy up front rather than smuggled in as a placeholder: **no "run the build" step anywhere**, replaced by an explicit manual API-signature self-check in every task, because no compiler is available - this is the plan's stated constraint, not an omission.

**Known highest-risk areas for the user's own fix pass, gathered in one place:** (1) Task 6's port-conflict detection assumption in `GuidonBrowserAuth` (`GetHttpRouter` vs. `StartAllListeners` as the actual failure signal), (2) Task 8's `"Mono"` typeface name for the Code rich-text style (may need to fall back to `"Regular"`), (3) Task 12's exact `Window` menu submenu placement (`WorkspaceMenu` category layout can differ slightly by engine version).

