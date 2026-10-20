#pragma once

#include "CoreMinimal.h"
#include "GuidonModels.h"
#include "Input/DragAndDrop.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Widgets/Input/SComboBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SCompoundWidget.h"

DECLARE_DELEGATE_TwoParams(FOnGuidonTaskDropped, const FString& /*TaskId*/, const FString& /*Status*/);

/** Payload of a card being dragged between columns. */
class FGuidonTaskDragDrop : public FDragDropOperation
{
public:
	DRAG_DROP_OPERATOR_TYPE(FGuidonTaskDragDrop, FDragDropOperation)

	FString TaskId;
	FString Title;

	static TSharedRef<FGuidonTaskDragDrop> New(const FString& TaskId, const FString& Title);
	virtual TSharedPtr<SWidget> GetDefaultDecorator() const override;
};

/** A board card: click opens it, dragging it starts an FGuidonTaskDragDrop. */
class SGuidonTaskCard : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonTaskCard) {}
		SLATE_ARGUMENT(FString, TaskId)
		SLATE_ARGUMENT(FString, Title)
		SLATE_EVENT(FSimpleDelegate, OnClicked)
		SLATE_DEFAULT_SLOT(FArguments, Content)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual FReply OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnDragDetected(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;

private:
	FString TaskId;
	FString Title;
	FSimpleDelegate OnClicked;
};

/** A board column that accepts dropped cards and highlights while one hovers over it. */
class SGuidonColumn : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonColumn) {}
		SLATE_ARGUMENT(FString, Status)
		SLATE_EVENT(FOnGuidonTaskDropped, OnTaskDropped)
		SLATE_DEFAULT_SLOT(FArguments, Content)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual void OnDragEnter(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent) override;
	virtual void OnDragLeave(const FDragDropEvent& DragDropEvent) override;
	virtual FReply OnDragOver(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent) override;
	virtual FReply OnDrop(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent) override;

private:
	const FSlateBrush* GetBrush() const;

	FString Status;
	FOnGuidonTaskDropped OnTaskDropped;
	bool bDragOver = false;
};

/**
 * The whole "Guidon Tasks" tab: toolbar (project picker, refresh, account),
 * the Kanban board, and a details panel for the selected task. Rebuilds the
 * board/details containers from the cached data after every change - the
 * same approach as the Unity window, simple and cheap at board sizes.
 */
class SGuidonTasksWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonTasksWidget) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	using FProjectPtr = TSharedPtr<FGuidonProject>;

	// --- UI construction
	TSharedRef<SWidget> BuildToolbar();
	TSharedRef<SWidget> BuildLoginPanel();
	TSharedRef<SWidget> BuildReportsBar();
	/**
	 * Rebuilds are deferred to Tick: most requests come from inside an event
	 * handler of a widget the rebuild would destroy (a card's click, a
	 * column's drop, a combo's selection, a checkbox), and tearing a widget
	 * down mid-handler is asking for a crash.
	 */
	void RebuildBoard() { bBoardDirty = true; }
	void RebuildDetails() { bDetailsDirty = true; }
	void DoRebuildBoard();
	void DoRebuildDetails();
	TSharedRef<SWidget> BuildColumn(const FGuidonColumn& Column);
	FText ColumnLabel(const FString& Status) const;
	void SetColumns(const TArray<FGuidonColumn>& NewColumns);
	void SetPriorities(const TArray<FGuidonPriority>& NewPriorities);

	// --- workflow vocabulary (project columns/priorities, migration 060)
	/** Project column colour, else the built-in one, else grey. */
	FLinearColor ColumnColor(const FString& Status) const;
	FText PriorityLabel(const FString& Priority) const;
	/** Project hex colour, else the built-in colour for that key, else grey. */
	FLinearColor PriorityColor(const FString& Priority) const;
	/** Index in the project's list (0 = most important); unknown/hidden keys sort after all known ones. */
	int32 PriorityRank(const FString& Priority) const;
	/** `done`, or a column marked is_done. */
	bool IsDoneStatus(const FString& Status) const;
	/** The server's is_done when it sent one, else derived from the status. */
	bool IsTaskDone(const FGuidonTask& Task) const;
	/** Where a ticked subtask goes: `done` if visible, else the first visible done column, else `done`. */
	FString DoneStatus() const;
	/** Where an unticked subtask goes: `todo` if visible, else the first visible open column, else `todo`. */
	FString OpenStatus() const;
	TSharedRef<SWidget> BuildCard(const FGuidonTask& Task);

	// --- data
	void RefreshProjects();
	void RefreshTasks();
	void LoadComments(const FString& TaskId);
	void SelectTask(const FString& TaskId);
	void OnProjectSelected(FProjectPtr Project, ESelectInfo::Type SelectInfo);
	void MoveTask(const FString& TaskId, const FString& NewStatus);
	void CreateTask(const FString& Title, const FString& Status, const FString& ParentTaskId);
	void SaveSelectedTask();
	void DeleteSelectedTask();
	void PostComment();
	void Login();
	void LogOut();
	void SetUpReports();
	FText ReportsStatusText() const;

	FGuidonTask* FindTask(const FString& TaskId);
	void ReplaceTask(const FGuidonTask& Task);
	TArray<const FGuidonTask*> ColumnTasks(const FString& Status) const;
	TArray<const FGuidonTask*> Subtasks(const FString& ParentId) const;

	void BeginRequest() { ++PendingRequests; ++Actions; }
	void EndRequest() { PendingRequests = FMath::Max(0, PendingRequests - 1); }
	void SetError(const FString& Error) { Message = Error; }
	TWeakPtr<SGuidonTasksWidget> WeakSelf();

	TArray<FProjectPtr> Projects;
	TArray<FGuidonTask> Tasks;
	/** The selected project's visible columns, board order. */
	TArray<FGuidonColumn> Columns;
	/** The selected project's visible priorities, most important first (list index = rank). */
	TArray<FGuidonPriority> Priorities;
	TMap<FString, TArray<FGuidonComment>> Comments;
	FString CurrentProjectId;
	FString SelectedTaskId;
	FString Message;
	FString BaseUrlEdit;
	int32 PendingRequests = 0;
	/** Bumped by every user request, so a background refresh that raced one is dropped. */
	int32 Actions = 0;
	bool bAutoRefreshRunning = false;
	EActiveTimerReturnType AutoRefreshTick(double InCurrentTime, float InDeltaTime);
	bool bBoardDirty = false;
	bool bDetailsDirty = false;

	/** Reports filter: the board shows only tasks filed by the in-game reporter or the web widget. */
	bool bReportsOnly = false;

	/** Column that currently shows the inline "new task" box, or empty. */
	FString AddingInStatus;

	// Details-panel edit buffers, reset whenever the selection changes.
	FString EditTitle;
	FString EditDescription;
	FString EditPriority;
	FString EditDueDate;
	FString NewSubtaskTitle;
	FString NewComment;

	/** Status combo options - the visible columns only, so a task can't be moved into a hidden one. */
	TArray<TSharedPtr<FString>> StatusOptions;
	/** Priority combo options - the project's visible priorities, most important first. */
	TArray<TSharedPtr<FString>> PriorityOptions;

	TSharedPtr<SComboBox<FProjectPtr>> ProjectCombo;
	TSharedPtr<SHorizontalBox> BoardBox;
	TSharedPtr<SVerticalBox> DetailsBox;
	TSharedPtr<SWidget> NewTaskTextBox;
};
