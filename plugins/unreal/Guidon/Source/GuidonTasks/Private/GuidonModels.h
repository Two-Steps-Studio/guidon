#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

// Plain structs parsed by hand from FJsonObject (not USTRUCT + FJsonObjectConverter):
// the API sends JSON nulls for empty optional columns, which are easiest to
// treat as "empty string / default" explicitly here.

struct FGuidonProject
{
	FString Id;
	FString Name;

	static FGuidonProject FromJson(const TSharedPtr<FJsonObject>& Json);
};

struct FGuidonTask
{
	FString Id;
	FString ProjectId;
	FString Title;
	FString Description;
	/** Any workflow key the project defines (built-in or custom, migration 060) - kept verbatim, never coerced. */
	FString Status;
	/** Same: built-in low/medium/high/critical or one of the project's own keys. */
	FString Priority;
	FString DueDate;
	FString ParentTaskId;
	FString CreatedAt;
	TArray<FString> Tags;
	/** Fractional on purpose - the web board inserts at midpoints (task-board.ts sortOrderForPosition). */
	double SortOrder = 0.0;
	/** The server's `is_done` (the task sits in a done column); only meaningful when bHasIsDone - older servers don't send it. */
	bool bIsDone = false;
	bool bHasIsDone = false;

	bool IsSubtask() const { return !ParentTaskId.IsEmpty(); }

	static FGuidonTask FromJson(const TSharedPtr<FJsonObject>& Json);
};

/** A moodboard image (GET /api/v1/projects/{id}/references). ImageUrl is signed and short-lived - download it right away. */
struct FGuidonReference
{
	FString Id;
	FString Name;
	FString Caption;
	FString SourceUrl;
	FString MimeType;
	FString ImageUrl;
	TArray<FString> Tags;

	FString DisplayName() const { return Caption.IsEmpty() ? Name : Caption; }

	static FGuidonReference FromJson(const TSharedPtr<FJsonObject>& Json);
};

/** One visible board column: a built-in or custom status key with the project's (possibly renamed) label. */
struct FGuidonColumn
{
	FString Status;
	FString Label;
	/** Tasks here count as finished. Older servers don't say - then only `done` is. */
	bool bIsDone = false;
	bool bCustom = false;
	/** "#rrggbb" or empty for the plugin's built-in colour. */
	FString Color;
};

/** One of the project's priorities (GET /api/v1/projects/{id}/priorities); the list is most important first. */
struct FGuidonPriority
{
	FString Key;
	FString Label;
	/** "#rrggbb" or empty for the plugin's built-in colour. */
	FString Color;
	bool bCustom = false;
};

struct FGuidonComment
{
	FString Id;
	FString Content;
	FString CreatedAt;
	FString ActorLabel;

	static FGuidonComment FromJson(const TSharedPtr<FJsonObject>& Json);
};

/**
 * Guidon's built-in task vocabulary, mirrored by hand from
 * src/lib/work/task-board.ts (BOARD_COLUMNS / TASK_PRIORITIES) - a
 * manual-sync point, same as the Unity plugin's GuidonVocabulary. Projects
 * can add their own statuses and priorities (migration 060), so these are
 * only the defaults/fallbacks: anything else is shown by its key, in grey.
 */
namespace GuidonVocabulary
{
	/** Built-in statuses in default board order. */
	const TArray<FString>& Statuses();
	/** Built-in priorities, most important first (critical .. low). */
	const TArray<FString>& Priorities();
	/** Built-in label, or the key itself for a custom/unknown status. */
	FText StatusLabel(const FString& Status);
	/** Built-in label, or the key itself for a custom/unknown priority. */
	FText PriorityLabel(const FString& Priority);
	/** The server's key shape for statuses/priorities: ^[a-z][a-z0-9_]{0,39}$ (task-board.ts WORKFLOW_KEY_RE). */
	bool IsWorkflowKey(const FString& Key);

	/** What the board shows when the server can't say (an older Guidon without the columns endpoint). */
	TArray<FGuidonColumn> DefaultColumns();
	/** The four built-ins, most important first - used when the server has no priorities endpoint (404). */
	TArray<FGuidonPriority> DefaultPriorities();
}
