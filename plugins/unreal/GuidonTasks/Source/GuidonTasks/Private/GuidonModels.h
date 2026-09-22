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
	FString Status;
	FString Priority;
	FString DueDate;
	FString ParentTaskId;
	FString CreatedAt;
	TArray<FString> Tags;
	/** Fractional on purpose - the web board inserts at midpoints (task-board.ts sortOrderForPosition). */
	double SortOrder = 0.0;

	bool IsSubtask() const { return !ParentTaskId.IsEmpty(); }

	static FGuidonTask FromJson(const TSharedPtr<FJsonObject>& Json);
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
 * Guidon's task vocabulary, mirrored by hand from src/lib/work/task-board.ts
 * (BOARD_COLUMNS / TASK_PRIORITIES) - a manual-sync point, same as the Unity
 * plugin's GuidonVocabulary.
 */
namespace GuidonVocabulary
{
	const TArray<FString>& Statuses();
	const TArray<FString>& Priorities();
	FText StatusLabel(const FString& Status);
	FText PriorityLabel(const FString& Priority);
}
