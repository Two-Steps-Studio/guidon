#include "GuidonModels.h"

#define LOCTEXT_NAMESPACE "GuidonTasks"

namespace
{
	FString GetString(const TSharedPtr<FJsonObject>& Json, const TCHAR* Field)
	{
		FString Value;
		if (Json.IsValid())
		{
			Json->TryGetStringField(Field, Value); // false (and Value untouched) for a JSON null
		}
		return Value;
	}
}

FGuidonProject FGuidonProject::FromJson(const TSharedPtr<FJsonObject>& Json)
{
	FGuidonProject Project;
	Project.Id = GetString(Json, TEXT("id"));
	Project.Name = GetString(Json, TEXT("name"));
	return Project;
}

FGuidonTask FGuidonTask::FromJson(const TSharedPtr<FJsonObject>& Json)
{
	FGuidonTask Task;
	Task.Id = GetString(Json, TEXT("id"));
	Task.ProjectId = GetString(Json, TEXT("project_id"));
	Task.Title = GetString(Json, TEXT("title"));
	Task.Description = GetString(Json, TEXT("description"));
	Task.Status = GetString(Json, TEXT("status"));
	Task.Priority = GetString(Json, TEXT("priority"));
	Task.DueDate = GetString(Json, TEXT("due_date"));
	Task.ParentTaskId = GetString(Json, TEXT("parent_task_id"));
	Task.CreatedAt = GetString(Json, TEXT("created_at"));

	if (Json.IsValid())
	{
		Json->TryGetNumberField(TEXT("sort_order"), Task.SortOrder);
		// Absent on older servers (and false for a JSON null) - then "done" is derived from the status.
		Task.bHasIsDone = Json->TryGetBoolField(TEXT("is_done"), Task.bIsDone);

		const TArray<TSharedPtr<FJsonValue>>* Tags = nullptr;
		if (Json->TryGetArrayField(TEXT("tags"), Tags) && Tags)
		{
			for (const TSharedPtr<FJsonValue>& Tag : *Tags)
			{
				FString TagString;
				if (Tag.IsValid() && Tag->TryGetString(TagString))
				{
					Task.Tags.Add(TagString);
				}
			}
		}
	}
	return Task;
}

FGuidonReference FGuidonReference::FromJson(const TSharedPtr<FJsonObject>& Json)
{
	FGuidonReference Reference;
	Reference.Id = GetString(Json, TEXT("id"));
	Reference.Name = GetString(Json, TEXT("name"));
	Reference.Caption = GetString(Json, TEXT("caption"));
	Reference.SourceUrl = GetString(Json, TEXT("source_url"));
	Reference.MimeType = GetString(Json, TEXT("mime_type"));
	Reference.ImageUrl = GetString(Json, TEXT("image_url"));

	const TArray<TSharedPtr<FJsonValue>>* Tags = nullptr;
	if (Json.IsValid() && Json->TryGetArrayField(TEXT("tags"), Tags) && Tags)
	{
		for (const TSharedPtr<FJsonValue>& Tag : *Tags)
		{
			FString TagString;
			if (Tag.IsValid() && Tag->TryGetString(TagString))
			{
				Reference.Tags.Add(TagString);
			}
		}
	}
	return Reference;
}

FGuidonComment FGuidonComment::FromJson(const TSharedPtr<FJsonObject>& Json)
{
	FGuidonComment Comment;
	Comment.Id = GetString(Json, TEXT("id"));
	Comment.Content = GetString(Json, TEXT("content"));
	Comment.CreatedAt = GetString(Json, TEXT("created_at"));
	Comment.ActorLabel = GetString(Json, TEXT("actor_label"));
	return Comment;
}

const TArray<FString>& GuidonVocabulary::Statuses()
{
	static const TArray<FString> Values = {
		TEXT("backlog"), TEXT("todo"), TEXT("in_progress"), TEXT("ai_working"), TEXT("review"), TEXT("done")};
	return Values;
}

const TArray<FString>& GuidonVocabulary::Priorities()
{
	// Most important first, like GET /priorities (task-board.ts PRIORITY_RANK) - list index = rank.
	static const TArray<FString> Values = {TEXT("critical"), TEXT("high"), TEXT("medium"), TEXT("low")};
	return Values;
}

FText GuidonVocabulary::StatusLabel(const FString& Status)
{
	if (Status == TEXT("backlog")) return LOCTEXT("Backlog", "Backlog");
	if (Status == TEXT("todo")) return LOCTEXT("Todo", "Todo");
	if (Status == TEXT("in_progress")) return LOCTEXT("InProgress", "In Progress");
	if (Status == TEXT("ai_working")) return LOCTEXT("AiWorking", "AI Working");
	if (Status == TEXT("review")) return LOCTEXT("Review", "Review");
	if (Status == TEXT("done")) return LOCTEXT("Done", "Done");
	return FText::FromString(Status);
}

FText GuidonVocabulary::PriorityLabel(const FString& Priority)
{
	if (Priority == TEXT("low")) return LOCTEXT("Low", "Low");
	if (Priority == TEXT("medium")) return LOCTEXT("Medium", "Medium");
	if (Priority == TEXT("high")) return LOCTEXT("High", "High");
	if (Priority == TEXT("critical")) return LOCTEXT("Critical", "Critical");
	return FText::FromString(Priority);
}

bool GuidonVocabulary::IsWorkflowKey(const FString& Key)
{
	if (Key.Len() < 1 || Key.Len() > 40 || !(Key[0] >= TEXT('a') && Key[0] <= TEXT('z')))
	{
		return false;
	}
	for (const TCHAR Ch : Key)
	{
		const bool bOk = (Ch >= TEXT('a') && Ch <= TEXT('z')) || (Ch >= TEXT('0') && Ch <= TEXT('9')) || Ch == TEXT('_');
		if (!bOk)
		{
			return false;
		}
	}
	return true;
}

TArray<FGuidonColumn> GuidonVocabulary::DefaultColumns()
{
	TArray<FGuidonColumn> Columns;
	for (const FString& Status : Statuses())
	{
		FGuidonColumn Column;
		Column.Status = Status;
		Column.Label = StatusLabel(Status).ToString();
		Column.bIsDone = Status == TEXT("done");
		Columns.Add(Column);
	}
	return Columns;
}

TArray<FGuidonPriority> GuidonVocabulary::DefaultPriorities()
{
	TArray<FGuidonPriority> Result;
	for (const FString& Key : Priorities())
	{
		FGuidonPriority Priority;
		Priority.Key = Key;
		Priority.Label = PriorityLabel(Key).ToString();
		Result.Add(Priority);
	}
	return Result;
}

#undef LOCTEXT_NAMESPACE
