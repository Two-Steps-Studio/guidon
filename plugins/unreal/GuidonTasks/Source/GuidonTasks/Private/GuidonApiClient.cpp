#include "GuidonApiClient.h"

#include "GuidonSettings.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
	using FOnJson = TFunction<void(bool bOk, TSharedPtr<FJsonObject> Body, const FString& Error)>;

	FString ToJsonString(const TSharedRef<FJsonObject>& Object)
	{
		FString Out;
		TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
			TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Out);
		FJsonSerializer::Serialize(Object, Writer);
		return Out;
	}

	TSharedPtr<FJsonObject> ParseObject(const FString& Text)
	{
		TSharedPtr<FJsonObject> Object;
		TSharedRef<TJsonReader<TCHAR>> Reader = TJsonReaderFactory<TCHAR>::Create(Text);
		if (!FJsonSerializer::Deserialize(Reader, Object))
		{
			return nullptr;
		}
		return Object;
	}

	void Send(const FString& Verb, const FString& Path, const TSharedPtr<FJsonObject>& Body, FOnJson Done)
	{
		if (!FGuidonSettings::IsConfigured())
		{
			Done(false, nullptr, TEXT("Log in first."));
			return;
		}

		FString BaseUrl = FGuidonSettings::GetBaseUrl();
		BaseUrl.RemoveFromEnd(TEXT("/"));

		TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
		Request->SetURL(BaseUrl + Path);
		Request->SetVerb(Verb);
		Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + FGuidonSettings::GetApiKey());
		Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
		if (Body.IsValid())
		{
			Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
			Request->SetContentAsString(ToJsonString(Body.ToSharedRef()));
		}

		Request->OnProcessRequestComplete().BindLambda(
			[Done = MoveTemp(Done)](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnected)
			{
				if (!bConnected || !Response.IsValid())
				{
					Done(false, nullptr, TEXT("Request failed - could not reach the Guidon server."));
					return;
				}

				const int32 Code = Response->GetResponseCode();
				TSharedPtr<FJsonObject> Json = ParseObject(Response->GetContentAsString());

				if (Code < 200 || Code >= 300)
				{
					FString ServerError;
					if (Json.IsValid())
					{
						Json->TryGetStringField(TEXT("error"), ServerError);
					}
					Done(false, nullptr, FString::Printf(TEXT("%d %s"), Code, *ServerError).TrimEnd());
					return;
				}

				if (!Json.IsValid())
				{
					Done(false, nullptr, TEXT("Malformed response from the Guidon server."));
					return;
				}
				Done(true, Json, FString());
			});

		Request->ProcessRequest();
	}

	template <typename T>
	TArray<T> ParseArray(const TSharedPtr<FJsonObject>& Body, const TCHAR* Field)
	{
		TArray<T> Items;
		const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
		if (Body.IsValid() && Body->TryGetArrayField(Field, Values) && Values)
		{
			for (const TSharedPtr<FJsonValue>& Value : *Values)
			{
				const TSharedPtr<FJsonObject>* Object = nullptr;
				if (Value.IsValid() && Value->TryGetObject(Object) && Object)
				{
					Items.Add(T::FromJson(*Object));
				}
			}
		}
		return Items;
	}

	template <typename T>
	bool ParseSingle(const TSharedPtr<FJsonObject>& Body, const TCHAR* Field, T& Out)
	{
		const TSharedPtr<FJsonObject>* Object = nullptr;
		if (Body.IsValid() && Body->TryGetObjectField(Field, Object) && Object)
		{
			Out = T::FromJson(*Object);
			return true;
		}
		return false;
	}

	FOnJson TaskHandler(GuidonApi::FOnTask Done)
	{
		return [Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject> Body, const FString& Error)
		{
			FGuidonTask Task;
			if (!bOk)
			{
				Done(false, Task, Error);
			}
			else if (!ParseSingle(Body, TEXT("task"), Task))
			{
				Done(false, Task, TEXT("Response had no task."));
			}
			else
			{
				Done(true, Task, FString());
			}
		};
	}
}

void GuidonApi::ListProjects(FOnProjects Done)
{
	Send(TEXT("GET"), TEXT("/api/v1/projects"), nullptr,
		[Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject> Body, const FString& Error)
		{ Done(bOk, bOk ? ParseArray<FGuidonProject>(Body, TEXT("projects")) : TArray<FGuidonProject>(), Error); });
}

void GuidonApi::ListTasks(const FString& ProjectId, FOnTasks Done)
{
	Send(TEXT("GET"), FString::Printf(TEXT("/api/v1/projects/%s/tasks"), *ProjectId), nullptr,
		[Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject> Body, const FString& Error)
		{ Done(bOk, bOk ? ParseArray<FGuidonTask>(Body, TEXT("tasks")) : TArray<FGuidonTask>(), Error); });
}

void GuidonApi::ListColumns(const FString& ProjectId, FOnColumns Done)
{
	Send(TEXT("GET"), FString::Printf(TEXT("/api/v1/projects/%s/columns"), *ProjectId), nullptr,
		[Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject> Body, const FString& Error)
		{
			TArray<FGuidonColumn> Columns;
			const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
			if (bOk && Body.IsValid() && Body->TryGetArrayField(TEXT("columns"), Values) && Values)
			{
				for (const TSharedPtr<FJsonValue>& Value : *Values)
				{
					const TSharedPtr<FJsonObject>* Object = nullptr;
					FGuidonColumn Column;
					if (!Value.IsValid() || !Value->TryGetObject(Object) || !Object
						|| !(*Object)->TryGetStringField(TEXT("status"), Column.Status)
						|| !GuidonVocabulary::Statuses().Contains(Column.Status)
						|| Columns.ContainsByPredicate([&Column](const FGuidonColumn& C) { return C.Status == Column.Status; }))
					{
						continue;
					}
					(*Object)->TryGetStringField(TEXT("label"), Column.Label);
					if (Column.Label.IsEmpty())
					{
						Column.Label = GuidonVocabulary::StatusLabel(Column.Status).ToString();
					}
					Columns.Add(Column);
				}
			}
			if (bOk && Columns.Num() == 0)
			{
				Columns = GuidonVocabulary::DefaultColumns();
			}
			Done(bOk, Columns, Error);
		});
}

void GuidonApi::CreateTask(const FString& ProjectId, const FString& Title, const FString& Description,
	const FString& Priority, const FString& DueDate, const FString& ParentTaskId, const FString& Status, FOnTask Done)
{
	TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("title"), Title);
	// Unlike Unity's JsonUtility, empty optionals can simply be left out.
	if (!Description.IsEmpty()) Body->SetStringField(TEXT("description"), Description);
	if (!Priority.IsEmpty()) Body->SetStringField(TEXT("priority"), Priority);
	if (!DueDate.IsEmpty()) Body->SetStringField(TEXT("due_date"), DueDate);
	if (!ParentTaskId.IsEmpty()) Body->SetStringField(TEXT("parent_task_id"), ParentTaskId);
	if (!Status.IsEmpty()) Body->SetStringField(TEXT("status"), Status);

	Send(TEXT("POST"), FString::Printf(TEXT("/api/v1/projects/%s/tasks"), *ProjectId), Body, TaskHandler(MoveTemp(Done)));
}

void GuidonApi::UpdateTaskFields(const FString& TaskId, const FString& Title, const FString& Description,
	const FString& Priority, const FString& DueDate, FOnTask Done)
{
	TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("title"), Title);
	Body->SetStringField(TEXT("description"), Description);
	Body->SetStringField(TEXT("priority"), Priority);
	Body->SetStringField(TEXT("due_date"), DueDate);

	Send(TEXT("PATCH"), FString::Printf(TEXT("/api/v1/tasks/%s"), *TaskId), Body, TaskHandler(MoveTemp(Done)));
}

void GuidonApi::UpdateSortOrder(const FString& TaskId, double SortOrder, FOnTask Done)
{
	TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetNumberField(TEXT("sort_order"), SortOrder);

	Send(TEXT("PATCH"), FString::Printf(TEXT("/api/v1/tasks/%s"), *TaskId), Body, TaskHandler(MoveTemp(Done)));
}

void GuidonApi::SetStatus(const FString& TaskId, const FString& Status, FOnTask Done)
{
	TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("status"), Status);

	Send(TEXT("PATCH"), FString::Printf(TEXT("/api/v1/tasks/%s/status"), *TaskId), Body, TaskHandler(MoveTemp(Done)));
}

void GuidonApi::DeleteTask(const FString& TaskId, FOnDone Done)
{
	Send(TEXT("DELETE"), FString::Printf(TEXT("/api/v1/tasks/%s"), *TaskId), nullptr,
		[Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject>, const FString& Error) { Done(bOk, Error); });
}

void GuidonApi::ListComments(const FString& TaskId, FOnComments Done)
{
	Send(TEXT("GET"), FString::Printf(TEXT("/api/v1/tasks/%s/comment"), *TaskId), nullptr,
		[Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject> Body, const FString& Error)
		{ Done(bOk, bOk ? ParseArray<FGuidonComment>(Body, TEXT("comments")) : TArray<FGuidonComment>(), Error); });
}

void GuidonApi::AddComment(const FString& TaskId, const FString& Content, FOnComment Done)
{
	TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("content"), Content);

	Send(TEXT("POST"), FString::Printf(TEXT("/api/v1/tasks/%s/comment"), *TaskId), Body,
		[Done = MoveTemp(Done)](bool bOk, TSharedPtr<FJsonObject> ResponseBody, const FString& Error)
		{
			FGuidonComment Comment;
			if (bOk && !ParseSingle(ResponseBody, TEXT("comment"), Comment))
			{
				Done(false, Comment, TEXT("Response had no comment."));
				return;
			}
			Done(bOk, Comment, Error);
		});
}
