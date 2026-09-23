#pragma once

#include "CoreMinimal.h"
#include "GuidonModels.h"

/**
 * Thin async wrapper over Guidon's /api/v1 - the same calls as the Unity
 * plugin's GuidonApiClient.cs. Built on the engine's HTTP + Json modules.
 *
 * Every callback runs on the game thread (FHttpModule's completion
 * delegates do) and gets bOk + either a value or an error message - never
 * an exception or assert, so a network failure only ever shows up as
 * text in the tab.
 */
namespace GuidonApi
{
	using FOnDone = TFunction<void(bool bOk, const FString& Error)>;
	using FOnProjects = TFunction<void(bool bOk, const TArray<FGuidonProject>& Projects, const FString& Error)>;
	using FOnTasks = TFunction<void(bool bOk, const TArray<FGuidonTask>& Tasks, const FString& Error)>;
	using FOnTask = TFunction<void(bool bOk, const FGuidonTask& Task, const FString& Error)>;
	using FOnComments = TFunction<void(bool bOk, const TArray<FGuidonComment>& Comments, const FString& Error)>;
	using FOnComment = TFunction<void(bool bOk, const FGuidonComment& Comment, const FString& Error)>;
	using FOnColumns = TFunction<void(bool bOk, const TArray<FGuidonColumn>& Columns, const FString& Error)>;

	void ListProjects(FOnProjects Done);
	void ListTasks(const FString& ProjectId, FOnTasks Done);

	/** The project's visible columns in board order. Unknown statuses are dropped; an empty answer means the defaults. */
	void ListColumns(const FString& ProjectId, FOnColumns Done);

	/** Empty ParentTaskId creates a top-level task in column Status; a real id creates a subtask (the API ignores Status/Priority for those). */
	void CreateTask(const FString& ProjectId, const FString& Title, const FString& Description, const FString& Priority,
		const FString& DueDate, const FString& ParentTaskId, const FString& Status, FOnTask Done);

	/** PATCH title/description/priority/due_date. An empty DueDate clears it. */
	void UpdateTaskFields(const FString& TaskId, const FString& Title, const FString& Description, const FString& Priority,
		const FString& DueDate, FOnTask Done);

	/** Commits a drag-and-drop position - only sort_order changes. */
	void UpdateSortOrder(const FString& TaskId, double SortOrder, FOnTask Done);

	void SetStatus(const FString& TaskId, const FString& Status, FOnTask Done);
	void DeleteTask(const FString& TaskId, FOnDone Done);
	void ListComments(const FString& TaskId, FOnComments Done);
	void AddComment(const FString& TaskId, const FString& Content, FOnComment Done);
}
