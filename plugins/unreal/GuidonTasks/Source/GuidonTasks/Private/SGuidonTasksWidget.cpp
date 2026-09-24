#include "SGuidonTasksWidget.h"

#include "Framework/Application/SlateApplication.h"
#include "GuidonApiClient.h"
#include "GuidonAuth.h"
#include "GuidonSettings.h"
#include "GuidonStyle.h"
#include "HAL/PlatformApplicationMisc.h"
#include "HAL/PlatformProcess.h"
#include "Misc/DateTime.h"
#include "Misc/MessageDialog.h"
#include "Styling/AppStyle.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SMultiLineEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSplitter.h"
#include "Widgets/Layout/SWidgetSwitcher.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "GuidonTasks"

namespace
{
	constexpr float ColumnWidth = 270.f;

	TSharedRef<STextBlock> MakeText(const FText& Text, int32 Size = 9, bool bBold = false, FLinearColor Color = GuidonStyle::Text())
	{
		return SNew(STextBlock).Text(Text).Font(GuidonStyle::Font(Size, bBold)).ColorAndOpacity(FSlateColor(Color));
	}

	TSharedRef<STextBlock> MakeMuted(const FText& Text) { return MakeText(Text, 8, false, GuidonStyle::MutedText()); }

	TSharedRef<SWidget> FieldLabel(const FText& Text)
	{
		return SNew(SBox).Padding(FMargin(0.f, 8.f, 0.f, 2.f))[MakeText(Text, 8, true, GuidonStyle::MutedText())];
	}

	const FButtonStyle& PrimaryButton() { return GuidonStyle::PrimaryButton(); }
	const FButtonStyle& SimpleButton() { return FAppStyle::Get().GetWidgetStyle<FButtonStyle>("SimpleButton"); }

	/** First non-empty line of a Markdown description, markers stripped - the card preview the site shows. */
	FString DescriptionPreview(const FString& Description)
	{
		TArray<FString> Lines;
		Description.ParseIntoArrayLines(Lines);
		for (FString Line : Lines)
		{
			Line = Line.TrimStartAndEnd();
			while (Line.StartsWith(TEXT("#")) || Line.StartsWith(TEXT("-")) || Line.StartsWith(TEXT("*")) || Line.StartsWith(TEXT(">")))
			{
				Line = Line.RightChop(1).TrimStart();
			}
			Line.ReplaceInline(TEXT("**"), TEXT(""));
			Line.ReplaceInline(TEXT("`"), TEXT(""));
			if (!Line.IsEmpty())
			{
				return Line.Len() > 90 ? Line.Left(89) + TEXT("\u2026") : Line;
			}
		}
		return FString();
	}

	/** "" or a YYYY-MM-DD the server's `new Date(...)` accepts; anything else is rejected before sending. */
	bool IsValidDueDate(const FString& Value)
	{
		if (Value.IsEmpty())
		{
			return true;
		}
		FDateTime Parsed;
		return Value.Len() == 10 && FDateTime::ParseIso8601(*Value, Parsed);
	}
}

// --- FGuidonTaskDragDrop ------------------------------------------------------

TSharedRef<FGuidonTaskDragDrop> FGuidonTaskDragDrop::New(const FString& TaskId, const FString& Title)
{
	TSharedRef<FGuidonTaskDragDrop> Operation = MakeShared<FGuidonTaskDragDrop>();
	Operation->TaskId = TaskId;
	Operation->Title = Title;
	Operation->Construct();
	return Operation;
}

TSharedPtr<SWidget> FGuidonTaskDragDrop::GetDefaultDecorator() const
{
	return SNew(SBorder)
		.BorderImage(GuidonStyle::CardBrush(true))
		.Padding(FMargin(10.f, 6.f))
		[
			MakeText(FText::FromString(Title), 9, true)
		];
}

// --- SGuidonTaskCard ------------------------------------------------------------

void SGuidonTaskCard::Construct(const FArguments& InArgs)
{
	TaskId = InArgs._TaskId;
	Title = InArgs._Title;
	OnClicked = InArgs._OnClicked;
	SetCursor(EMouseCursor::Hand);
	ChildSlot[InArgs._Content.Widget];
}

FReply SGuidonTaskCard::OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (MouseEvent.GetEffectingButton() == EKeys::LeftMouseButton)
	{
		return FReply::Handled().DetectDrag(SharedThis(this), EKeys::LeftMouseButton);
	}
	return FReply::Unhandled();
}

FReply SGuidonTaskCard::OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	// Only reached when no drag started - a completed drag ends in the column's OnDrop instead.
	if (MouseEvent.GetEffectingButton() == EKeys::LeftMouseButton)
	{
		OnClicked.ExecuteIfBound();
		return FReply::Handled();
	}
	return FReply::Unhandled();
}

FReply SGuidonTaskCard::OnDragDetected(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	return FReply::Handled().BeginDragDrop(FGuidonTaskDragDrop::New(TaskId, Title));
}

// --- SGuidonColumn ------------------------------------------------------------

void SGuidonColumn::Construct(const FArguments& InArgs)
{
	Status = InArgs._Status;
	OnTaskDropped = InArgs._OnTaskDropped;

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(TAttribute<const FSlateBrush*>::CreateSP(this, &SGuidonColumn::GetBrush))
		.Padding(8.f)
		[
			InArgs._Content.Widget
		]
	];
}

const FSlateBrush* SGuidonColumn::GetBrush() const
{
	return GuidonStyle::ColumnBrush(bDragOver);
}

void SGuidonColumn::OnDragEnter(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent)
{
	bDragOver = DragDropEvent.GetOperationAs<FGuidonTaskDragDrop>().IsValid();
}

void SGuidonColumn::OnDragLeave(const FDragDropEvent& DragDropEvent)
{
	bDragOver = false;
}

FReply SGuidonColumn::OnDragOver(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent)
{
	return DragDropEvent.GetOperationAs<FGuidonTaskDragDrop>().IsValid() ? FReply::Handled() : FReply::Unhandled();
}

FReply SGuidonColumn::OnDrop(const FGeometry& MyGeometry, const FDragDropEvent& DragDropEvent)
{
	bDragOver = false;
	TSharedPtr<FGuidonTaskDragDrop> Operation = DragDropEvent.GetOperationAs<FGuidonTaskDragDrop>();
	if (!Operation.IsValid())
	{
		return FReply::Unhandled();
	}
	OnTaskDropped.ExecuteIfBound(Operation->TaskId, Status);
	return FReply::Handled();
}

// --- SGuidonTasksWidget: construction ---------------------------------------------

TWeakPtr<SGuidonTasksWidget> SGuidonTasksWidget::WeakSelf()
{
	return StaticCastSharedRef<SGuidonTasksWidget>(AsShared());
}

void SGuidonTasksWidget::Construct(const FArguments& InArgs)
{
	SetColumns(GuidonVocabulary::DefaultColumns());
	for (const FString& Priority : GuidonVocabulary::Priorities())
	{
		PriorityOptions.Add(MakeShared<FString>(Priority));
	}
	CurrentProjectId = FGuidonSettings::GetProjectId();
	BaseUrlEdit = FGuidonSettings::GetBaseUrl();

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(GuidonStyle::WindowBrush())
		.Padding(10.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[
				BuildToolbar()
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 8.f, 0.f, 0.f)
			[
				SNew(SBorder)
				.BorderImage(GuidonStyle::ErrorBrush())
				.Padding(FMargin(10.f, 6.f))
				.Visibility_Lambda([this]() { return Message.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
					[
						SNew(STextBlock)
						.Text_Lambda([this]() { return FText::FromString(Message); })
						.ColorAndOpacity(FSlateColor(GuidonStyle::Destructive()))
						.AutoWrapText(true)
					]
					+ SHorizontalBox::Slot().AutoWidth()
					[
						SNew(SButton)
						.ButtonStyle(&SimpleButton())
						.Text(LOCTEXT("Dismiss", "\u2715"))
						.OnClicked_Lambda([this]() { Message.Reset(); return FReply::Handled(); })
					]
				]
			]
			+ SVerticalBox::Slot().FillHeight(1.f).Padding(0.f, 10.f, 0.f, 0.f)
			[
				SNew(SWidgetSwitcher)
				.WidgetIndex_Lambda([]() { return FGuidonSettings::IsConfigured() ? 1 : 0; })
				+ SWidgetSwitcher::Slot()
				[
					BuildLoginPanel()
				]
				+ SWidgetSwitcher::Slot()
				[
					SNew(SSplitter)
					.Orientation(Orient_Horizontal)
					+ SSplitter::Slot().Value(0.7f)
					[
						SNew(SScrollBox)
						.Orientation(Orient_Horizontal)
						+ SScrollBox::Slot()
						[
							SAssignNew(BoardBox, SHorizontalBox)
						]
					]
					+ SSplitter::Slot().Value(0.3f)
					[
						SNew(SBorder)
						.BorderImage(GuidonStyle::ColumnBrush(false))
						.Padding(12.f)
						[
							SNew(SScrollBox)
							+ SScrollBox::Slot()
							[
								SAssignNew(DetailsBox, SVerticalBox)
							]
						]
					]
				]
			]
		]
	];

	DoRebuildBoard();
	DoRebuildDetails();
	if (FGuidonSettings::IsConfigured())
	{
		RefreshProjects();
	}
}

void SGuidonTasksWidget::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	if (bBoardDirty)
	{
		bBoardDirty = false;
		DoRebuildBoard();
	}
	if (bDetailsDirty)
	{
		bDetailsDirty = false;
		DoRebuildDetails();
	}
}

TSharedRef<SWidget> SGuidonTasksWidget::BuildToolbar()
{
	auto LoggedInVisibility = []() { return FGuidonSettings::IsConfigured() ? EVisibility::Visible : EVisibility::Collapsed; };

	return SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 12.f, 0.f)
		[
			MakeText(LOCTEXT("Brand", "Guidon"), 13, true, GuidonStyle::Accent())
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
		[
			SNew(SBox)
			.MinDesiredWidth(220.f)
			.Visibility_Lambda(LoggedInVisibility)
			[
				SAssignNew(ProjectCombo, SComboBox<FProjectPtr>)
				.OptionsSource(&Projects)
				.OnGenerateWidget_Lambda([](FProjectPtr Project) -> TSharedRef<SWidget> { return MakeText(FText::FromString(Project->Name)); })
				.OnSelectionChanged(this, &SGuidonTasksWidget::OnProjectSelected)
				[
					SNew(STextBlock).Text_Lambda([this]()
					{
						for (const FProjectPtr& Project : Projects)
						{
							if (Project->Id == CurrentProjectId)
							{
								return FText::FromString(Project->Name);
							}
						}
						return LOCTEXT("PickProject", "Pick a project");
					})
				]
			]
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6.f, 0.f, 0.f, 0.f)
		[
			SNew(SButton)
			.Visibility_Lambda(LoggedInVisibility)
			.Text(LOCTEXT("Refresh", "Refresh"))
			.OnClicked_Lambda([this]() { RefreshProjects(); return FReply::Handled(); })
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6.f, 0.f, 0.f, 0.f)
		[
			SNew(SButton)
			.Visibility_Lambda(LoggedInVisibility)
			.Text(LOCTEXT("OpenInBrowser", "Open in Browser"))
			.ToolTipText(LOCTEXT("OpenInBrowserTip", "Open this project's board on the Guidon website"))
			.IsEnabled_Lambda([this]() { return !CurrentProjectId.IsEmpty(); })
			.OnClicked_Lambda([this]()
			{
				FString BaseUrl = FGuidonSettings::GetBaseUrl();
				BaseUrl.RemoveFromEnd(TEXT("/"));
				FPlatformProcess::LaunchURL(*FString::Printf(TEXT("%s/projects/%s/work"), *BaseUrl, *CurrentProjectId), nullptr, nullptr);
				return FReply::Handled();
			})
		]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNullWidget::NullWidget
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 12.f, 0.f)
		[
			SNew(STextBlock)
			.Text(LOCTEXT("Loading", "Loading\u2026"))
			.ColorAndOpacity(FSlateColor(GuidonStyle::MutedText()))
			.Visibility_Lambda([this]() { return PendingRequests > 0 ? EVisibility::Visible : EVisibility::Hidden; })
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 8.f, 0.f)
		[
			SNew(STextBlock)
			.Visibility_Lambda(LoggedInVisibility)
			.ColorAndOpacity(FSlateColor(GuidonStyle::MutedText()))
			.Text_Lambda([]() { return FText::Format(LOCTEXT("LoggedInAs", "Logged in as {0}"), FText::FromString(FGuidonSettings::GetEmail())); })
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
		[
			SNew(SButton)
			.Visibility_Lambda(LoggedInVisibility)
			.Text(LOCTEXT("LogOut", "Log Out"))
			.ToolTipText(LOCTEXT("LogOutTip", "Forget the key on this machine. It stays under Profile > API Keys until you revoke it there."))
			.OnClicked_Lambda([this]() { LogOut(); return FReply::Handled(); })
		];
}

TSharedRef<SWidget> SGuidonTasksWidget::BuildLoginPanel()
{
	return SNew(SBox)
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(380.f)
			[
				SNew(SBorder)
				.BorderImage(GuidonStyle::ColumnBrush(false))
				.Padding(20.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeText(LOCTEXT("LoginTitle", "Log in to Guidon"), 12, true)
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)
					[
						SNew(STextBlock)
						.AutoWrapText(true)
						.ColorAndOpacity(FSlateColor(GuidonStyle::MutedText()))
						.Text(LOCTEXT("LoginHelp", "Logging in opens the Guidon website in your browser. Approve the plugin there and this tab picks up the result automatically."))
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						FieldLabel(LOCTEXT("BaseUrl", "Base URL"))
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SEditableTextBox)
						.Text(FText::FromString(BaseUrlEdit))
						.HintText(LOCTEXT("BaseUrlHint", "https://useguidon.com"))
						.OnTextChanged_Lambda([this](const FText& Text) { BaseUrlEdit = Text.ToString(); })
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 14.f, 0.f, 0.f)
					[
						SNew(SButton)
						.ButtonStyle(&PrimaryButton())
						.HAlign(HAlign_Center)
						.IsEnabled_Lambda([]() { return !FGuidonAuth::IsInProgress(); })
						.Text_Lambda([]()
						{
							return FGuidonAuth::IsInProgress() ? LOCTEXT("Waiting", "Waiting for the browser\u2026") : LOCTEXT("LogIn", "Log In");
						})
						.OnClicked_Lambda([this]() { Login(); return FReply::Handled(); })
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)
					[
						SNew(SButton)
						.HAlign(HAlign_Center)
						.Visibility_Lambda([]() { return FGuidonAuth::IsInProgress() ? EVisibility::Visible : EVisibility::Collapsed; })
						.Text(LOCTEXT("CancelLogin", "Cancel"))
						.OnClicked_Lambda([]() { FGuidonAuth::Cancel(); return FReply::Handled(); })
					]
				]
			]
		];
}

// --- board ----------------------------------------------------------------------

void SGuidonTasksWidget::DoRebuildBoard()
{
	if (!BoardBox.IsValid())
	{
		return;
	}
	BoardBox->ClearChildren();
	NewTaskTextBox.Reset();

	if (CurrentProjectId.IsEmpty())
	{
		BoardBox->AddSlot().AutoWidth().Padding(8.f)
		[
			MakeMuted(Projects.Num() == 0 ? LOCTEXT("NoProjects", "No projects loaded yet.") : LOCTEXT("PickAProject", "Pick a project above."))
		];
		return;
	}

	for (const FGuidonColumn& Column : Columns)
	{
		BoardBox->AddSlot().AutoWidth().Padding(0.f, 0.f, 10.f, 0.f)
		[
			BuildColumn(Column.Status, Column.Label)
		];
	}

	if (NewTaskTextBox.IsValid())
	{
		FSlateApplication::Get().SetKeyboardFocus(NewTaskTextBox, EFocusCause::SetDirectly);
	}
}

FText SGuidonTasksWidget::ColumnLabel(const FString& Status) const
{
	const FGuidonColumn* Column = Columns.FindByPredicate([&Status](const FGuidonColumn& C) { return C.Status == Status; });
	return Column ? FText::FromString(Column->Label) : GuidonVocabulary::StatusLabel(Status);
}

void SGuidonTasksWidget::SetColumns(const TArray<FGuidonColumn>& NewColumns)
{
	Columns = NewColumns;
	StatusOptions.Reset();
	for (const FGuidonColumn& Column : Columns)
	{
		StatusOptions.Add(MakeShared<FString>(Column.Status));
	}
}

TSharedRef<SWidget> SGuidonTasksWidget::BuildColumn(const FString& Status, const FString& Label)
{
	const TArray<const FGuidonTask*> ColumnItems = ColumnTasks(Status);

	TSharedRef<SVerticalBox> Cards = SNew(SVerticalBox);
	for (const FGuidonTask* Task : ColumnItems)
	{
		Cards->AddSlot().AutoHeight().Padding(0.f, 0.f, 0.f, 6.f)[BuildCard(*Task)];
	}

	if (AddingInStatus == Status)
	{
		TSharedRef<SEditableTextBox> TitleBox = SNew(SEditableTextBox)
			.HintText(LOCTEXT("NewTaskHint", "Task title, Enter to create"))
			.OnTextCommitted_Lambda([this, Status](const FText& Text, ETextCommit::Type CommitType)
			{
				if (CommitType == ETextCommit::OnEnter && !Text.ToString().TrimStartAndEnd().IsEmpty())
				{
					AddingInStatus.Reset();
					CreateTask(Text.ToString().TrimStartAndEnd(), Status, FString());
				}
				else if (CommitType == ETextCommit::OnCleared)
				{
					AddingInStatus.Reset();
					RebuildBoard();
				}
			});
		NewTaskTextBox = TitleBox;
		Cards->AddSlot().AutoHeight()[TitleBox];
	}
	else if (ColumnItems.Num() == 0)
	{
		Cards->AddSlot().AutoHeight().Padding(4.f, 8.f)[MakeMuted(LOCTEXT("EmptyColumn", "Drop tasks here"))];
	}

	return SNew(SBox)
		.WidthOverride(ColumnWidth)
		[
			SNew(SGuidonColumn)
			.Status(Status)
			.OnTaskDropped(FOnGuidonTaskDropped::CreateSP(this, &SGuidonTasksWidget::MoveTask))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().Padding(2.f, 0.f, 2.f, 8.f)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 6.f, 0.f)
					[
						SNew(SBox).WidthOverride(8.f).HeightOverride(8.f)[SNew(SImage).Image(GuidonStyle::DotBrush(Status))]
					]
					+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
					[
						MakeText(FText::FromString(Label), 10, true)
					]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 6.f, 0.f)
					[
						SNew(SBorder)
						.BorderImage(GuidonStyle::PillBrush())
						.Padding(FMargin(6.f, 1.f))
						[
							MakeMuted(FText::AsNumber(ColumnItems.Num()))
						]
					]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
					[
						SNew(SButton)
						.ButtonStyle(&SimpleButton())
						.ToolTipText(LOCTEXT("AddTaskTip", "Create a task in this column"))
						.Text(LOCTEXT("Plus", "+"))
						.OnClicked_Lambda([this, Status]()
						{
							AddingInStatus = AddingInStatus == Status ? FString() : Status;
							RebuildBoard();
							return FReply::Handled();
						})
					]
				]
				// The web column's border-b under its header.
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
				[
					SNew(SBox).HeightOverride(1.f)[SNew(SImage).Image(GuidonStyle::DividerBrush())]
				]
				+ SVerticalBox::Slot().FillHeight(1.f)
				[
					SNew(SScrollBox)
					+ SScrollBox::Slot()
					[
						Cards
					]
				]
			]
		];
}

TSharedRef<SWidget> SGuidonTasksWidget::BuildCard(const FGuidonTask& Task)
{
	TSharedRef<SVerticalBox> Body = SNew(SVerticalBox);

	// Priority dot before the title, like the web card.
	Body->AddSlot().AutoHeight()
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top).Padding(0.f, 5.f, 8.f, 0.f)
		[
			SNew(SBox).WidthOverride(6.f).HeightOverride(6.f)[SNew(SImage).Image(GuidonStyle::PriorityDotBrush(Task.Priority))]
		]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(STextBlock)
			.Text(FText::FromString(Task.Title))
			.Font(GuidonStyle::Font(9, true))
			.ColorAndOpacity(FSlateColor(GuidonStyle::Text()))
			.AutoWrapText(true)
		]
	];

	const FString Preview = DescriptionPreview(Task.Description);
	if (!Preview.IsEmpty())
	{
		Body->AddSlot().AutoHeight().Padding(0.f, 3.f, 0.f, 0.f)
		[
			SNew(STextBlock)
			.Text(FText::FromString(Preview))
			.Font(GuidonStyle::Font(8))
			.ColorAndOpacity(FSlateColor(GuidonStyle::MutedText()))
			.AutoWrapText(true)
		];
	}

	if (Task.Tags.Num() > 0)
	{
		TSharedRef<SWrapBox> TagBox = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(4.f, 4.f));
		for (const FString& Tag : Task.Tags)
		{
			TagBox->AddSlot()
			[
				SNew(SBorder).BorderImage(GuidonStyle::PillBrush()).Padding(FMargin(7.f, 1.f))[MakeMuted(FText::FromString(Tag))]
			];
		}
		Body->AddSlot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)[TagBox];
	}

	TSharedRef<SHorizontalBox> Footer = SNew(SHorizontalBox);
	Footer->AddSlot().AutoWidth().Padding(0.f, 0.f, 10.f, 0.f)
	[
		MakeMuted(GuidonVocabulary::PriorityLabel(Task.Priority))
	];
	if (!Task.DueDate.IsEmpty())
	{
		Footer->AddSlot().AutoWidth().Padding(0.f, 0.f, 10.f, 0.f)[MakeMuted(FText::FromString(Task.DueDate.Left(10)))];
	}
	const TArray<const FGuidonTask*> Subs = Subtasks(Task.Id);
	if (Subs.Num() > 0)
	{
		const int32 Done = Subs.FilterByPredicate([](const FGuidonTask* Sub) { return Sub->Status == TEXT("done"); }).Num();
		Footer->AddSlot().AutoWidth()[MakeMuted(FText::FromString(FString::Printf(TEXT("\u2713 %d/%d"), Done, Subs.Num())))];
	}
	Body->AddSlot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)[Footer];

	const FString TaskId = Task.Id;
	return SNew(SGuidonTaskCard)
		.TaskId(Task.Id)
		.Title(Task.Title)
		.OnClicked(FSimpleDelegate::CreateLambda([this, TaskId]() { SelectTask(TaskId); }))
		[
			SNew(SBorder)
			.BorderImage(GuidonStyle::CardBrush(Task.Id == SelectedTaskId))
			.Padding(12.f)
			[
				Body
			]
		];
}

// --- details --------------------------------------------------------------------

void SGuidonTasksWidget::DoRebuildDetails()
{
	if (!DetailsBox.IsValid())
	{
		return;
	}
	DetailsBox->ClearChildren();

	const FGuidonTask* TaskPtr = FindTask(SelectedTaskId);
	if (!TaskPtr)
	{
		DetailsBox->AddSlot().AutoHeight()
		[
			SNew(STextBlock)
			.AutoWrapText(true)
			.ColorAndOpacity(FSlateColor(GuidonStyle::MutedText()))
			.Text(LOCTEXT("NoSelection", "Click a card to open it here. Drag cards between columns to change their status."))
		];
		return;
	}
	// Copy - the handlers below may replace the task in Tasks while this panel is alive.
	const FGuidonTask Task = *TaskPtr;
	const FString TaskId = Task.Id;

	if (Task.IsSubtask())
	{
		const FString ParentId = Task.ParentTaskId;
		DetailsBox->AddSlot().AutoHeight().Padding(0.f, 0.f, 0.f, 6.f)
		[
			SNew(SButton)
			.ButtonStyle(&SimpleButton())
			.Text(LOCTEXT("BackToParent", "\u2190 Back to parent task"))
			.OnClicked_Lambda([this, ParentId]() { SelectTask(ParentId); return FReply::Handled(); })
		];
	}

	DetailsBox->AddSlot().AutoHeight()[FieldLabel(LOCTEXT("Title", "Title"))];
	DetailsBox->AddSlot().AutoHeight()
	[
		SNew(SEditableTextBox)
		.Text(FText::FromString(EditTitle))
		.OnTextChanged_Lambda([this](const FText& Text) { EditTitle = Text.ToString(); })
	];

	TSharedPtr<FString> CurrentStatus;
	for (const TSharedPtr<FString>& Option : StatusOptions)
	{
		if (*Option == Task.Status) CurrentStatus = Option;
	}
	TSharedPtr<FString> CurrentPriority;
	for (const TSharedPtr<FString>& Option : PriorityOptions)
	{
		if (*Option == EditPriority) CurrentPriority = Option;
	}

	DetailsBox->AddSlot().AutoHeight()
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().FillWidth(1.f).Padding(0.f, 0.f, 6.f, 0.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()[FieldLabel(LOCTEXT("Status", "Status"))]
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SComboBox<TSharedPtr<FString>>)
				.OptionsSource(&StatusOptions)
				.InitiallySelectedItem(CurrentStatus)
				.OnGenerateWidget_Lambda([this](TSharedPtr<FString> Item) -> TSharedRef<SWidget> { return MakeText(ColumnLabel(*Item)); })
				.OnSelectionChanged_Lambda([this, TaskId](TSharedPtr<FString> Item, ESelectInfo::Type SelectInfo)
				{
					if (Item.IsValid() && SelectInfo != ESelectInfo::Direct)
					{
						MoveTask(TaskId, *Item);
					}
				})
				[
					MakeText(ColumnLabel(Task.Status))
				]
			]
		]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()[FieldLabel(LOCTEXT("Priority", "Priority"))]
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SComboBox<TSharedPtr<FString>>)
				.OptionsSource(&PriorityOptions)
				.InitiallySelectedItem(CurrentPriority)
				.OnGenerateWidget_Lambda([](TSharedPtr<FString> Item) -> TSharedRef<SWidget> { return MakeText(GuidonVocabulary::PriorityLabel(*Item)); })
				.OnSelectionChanged_Lambda([this](TSharedPtr<FString> Item, ESelectInfo::Type)
				{
					if (Item.IsValid()) EditPriority = *Item;
				})
				[
					SNew(STextBlock).Text_Lambda([this]() { return GuidonVocabulary::PriorityLabel(EditPriority); })
				]
			]
		]
	];

	DetailsBox->AddSlot().AutoHeight()[FieldLabel(LOCTEXT("DueDate", "Due date"))];
	DetailsBox->AddSlot().AutoHeight()
	[
		SNew(SEditableTextBox)
		.Text(FText::FromString(EditDueDate))
		.HintText(LOCTEXT("DueDateHint", "YYYY-MM-DD, empty for none"))
		.OnTextChanged_Lambda([this](const FText& Text) { EditDueDate = Text.ToString().TrimStartAndEnd(); })
	];

	DetailsBox->AddSlot().AutoHeight()[FieldLabel(LOCTEXT("Description", "Description (Markdown)"))];
	DetailsBox->AddSlot().AutoHeight()
	[
		SNew(SBox)
		.MinDesiredHeight(120.f)
		[
			SNew(SMultiLineEditableTextBox)
			.Text(FText::FromString(EditDescription))
			.AutoWrapText(true)
			.OnTextChanged_Lambda([this](const FText& Text) { EditDescription = Text.ToString(); })
		]
	];

	DetailsBox->AddSlot().AutoHeight().Padding(0.f, 10.f, 0.f, 0.f)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)
		[
			SNew(SButton)
			.ButtonStyle(&PrimaryButton())
			.Text(LOCTEXT("Save", "Save"))
			.OnClicked_Lambda([this]() { SaveSelectedTask(); return FReply::Handled(); })
		]
		+ SHorizontalBox::Slot().AutoWidth()
		[
			SNew(SButton)
			.ButtonStyle(&GuidonStyle::DestructiveButton())
			.Text(LOCTEXT("Delete", "Delete"))
			.OnClicked_Lambda([this]() { DeleteSelectedTask(); return FReply::Handled(); })
		]
		+ SHorizontalBox::Slot().AutoWidth().Padding(6.f, 0.f, 0.f, 0.f)
		[
			SNew(SButton)
			.Text(LOCTEXT("CopyGitRef", "Copy Git ref"))
			.ToolTipText(LOCTEXT("CopyGitRefTip", "Copy guidon#<id>: mention it in a commit, PR or branch name and the GitHub integration links and moves this task"))
			.OnClicked_Lambda([TaskId]()
			{
				// guidon#1a2b3c4d - what the GitHub integration recognises in commits, PRs and branch names.
				FPlatformApplicationMisc::ClipboardCopy(*(TEXT("guidon#") + TaskId.Left(8).ToLower()));
				return FReply::Handled();
			})
		]
	];

	if (!Task.IsSubtask())
	{
		DetailsBox->AddSlot().AutoHeight().Padding(0.f, 10.f, 0.f, 0.f)[FieldLabel(LOCTEXT("Subtasks", "Subtasks"))];
		for (const FGuidonTask* Sub : Subtasks(TaskId))
		{
			const FString SubId = Sub->Id;
			DetailsBox->AddSlot().AutoHeight()
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(SCheckBox)
					.IsChecked(Sub->Status == TEXT("done") ? ECheckBoxState::Checked : ECheckBoxState::Unchecked)
					.OnCheckStateChanged_Lambda([this, SubId](ECheckBoxState State)
					{
						MoveTask(SubId, State == ECheckBoxState::Checked ? TEXT("done") : TEXT("todo"));
					})
				]
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
				[
					SNew(SButton)
					.ButtonStyle(&SimpleButton())
					.Text(FText::FromString(Sub->Title))
					.OnClicked_Lambda([this, SubId]() { SelectTask(SubId); return FReply::Handled(); })
				]
			];
		}
		DetailsBox->AddSlot().AutoHeight().Padding(0.f, 4.f, 0.f, 0.f)
		[
			SNew(SEditableTextBox)
			.Text(FText::FromString(NewSubtaskTitle))
			.HintText(LOCTEXT("NewSubtaskHint", "New subtask, Enter to add"))
			.OnTextChanged_Lambda([this](const FText& Text) { NewSubtaskTitle = Text.ToString(); })
			.OnTextCommitted_Lambda([this, TaskId](const FText& Text, ETextCommit::Type CommitType)
			{
				const FString Title = Text.ToString().TrimStartAndEnd();
				if (CommitType == ETextCommit::OnEnter && !Title.IsEmpty())
				{
					NewSubtaskTitle.Reset();
					CreateTask(Title, FString(), TaskId);
				}
			})
		];
	}

	DetailsBox->AddSlot().AutoHeight().Padding(0.f, 10.f, 0.f, 0.f)[FieldLabel(LOCTEXT("Comments", "Comments"))];
	const TArray<FGuidonComment>* TaskComments = Comments.Find(TaskId);
	if (!TaskComments)
	{
		DetailsBox->AddSlot().AutoHeight()[MakeMuted(LOCTEXT("LoadingComments", "Loading\u2026"))];
	}
	else if (TaskComments->Num() == 0)
	{
		DetailsBox->AddSlot().AutoHeight()[MakeMuted(LOCTEXT("NoComments", "No comments yet."))];
	}
	else
	{
		for (const FGuidonComment& Comment : *TaskComments)
		{
			const FString Author = Comment.ActorLabel.IsEmpty() ? TEXT("Someone") : Comment.ActorLabel;
			const FString When = Comment.CreatedAt.Left(16).Replace(TEXT("T"), TEXT(" "));
			DetailsBox->AddSlot().AutoHeight().Padding(0.f, 0.f, 0.f, 6.f)
			[
				SNew(SBorder)
				.BorderImage(GuidonStyle::CardBrush(false))
				.Padding(8.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[MakeMuted(FText::FromString(Author + TEXT(" - ") + When))]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 3.f, 0.f, 0.f)
					[
						SNew(STextBlock)
						.Text(FText::FromString(Comment.Content))
						.ColorAndOpacity(FSlateColor(GuidonStyle::Text()))
						.AutoWrapText(true)
					]
				]
			];
		}
	}

	DetailsBox->AddSlot().AutoHeight().Padding(0.f, 4.f, 0.f, 0.f)
	[
		SNew(SBox)
		.MinDesiredHeight(50.f)
		[
			SNew(SMultiLineEditableTextBox)
			.Text(FText::FromString(NewComment))
			.HintText(LOCTEXT("CommentHint", "Write a comment\u2026"))
			.AutoWrapText(true)
			.OnTextChanged_Lambda([this](const FText& Text) { NewComment = Text.ToString(); })
		]
	];
	DetailsBox->AddSlot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f).HAlign(HAlign_Right)
	[
		SNew(SButton)
		.ButtonStyle(&PrimaryButton())
		.Text(LOCTEXT("Post", "Post"))
		.OnClicked_Lambda([this]() { PostComment(); return FReply::Handled(); })
	];
}

// --- data -------------------------------------------------------------------------

FGuidonTask* SGuidonTasksWidget::FindTask(const FString& TaskId)
{
	return TaskId.IsEmpty() ? nullptr : Tasks.FindByPredicate([&TaskId](const FGuidonTask& Task) { return Task.Id == TaskId; });
}

void SGuidonTasksWidget::ReplaceTask(const FGuidonTask& Task)
{
	if (FGuidonTask* Existing = FindTask(Task.Id))
	{
		*Existing = Task;
	}
	else
	{
		Tasks.Add(Task);
	}
}

TArray<const FGuidonTask*> SGuidonTasksWidget::ColumnTasks(const FString& Status) const
{
	TArray<const FGuidonTask*> Result;
	for (const FGuidonTask& Task : Tasks)
	{
		if (Task.Status == Status && !Task.IsSubtask())
		{
			Result.Add(&Task);
		}
	}
	// Stable: equal sort_orders keep the API's newest-first order.
	Result.StableSort([](const FGuidonTask* A, const FGuidonTask* B) { return A->SortOrder < B->SortOrder; });
	return Result;
}

TArray<const FGuidonTask*> SGuidonTasksWidget::Subtasks(const FString& ParentId) const
{
	TArray<const FGuidonTask*> Result;
	for (const FGuidonTask& Task : Tasks)
	{
		if (Task.ParentTaskId == ParentId)
		{
			Result.Add(&Task);
		}
	}
	Result.StableSort([](const FGuidonTask* A, const FGuidonTask* B) { return A->CreatedAt < B->CreatedAt; });
	return Result;
}

void SGuidonTasksWidget::RefreshProjects()
{
	BeginRequest();
	GuidonApi::ListProjects([Weak = WeakSelf()](bool bOk, const TArray<FGuidonProject>& Loaded, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!Self) return;
		Self->EndRequest();
		if (!bOk)
		{
			Self->SetError(Error);
			return;
		}
		Self->Message.Reset();

		Self->Projects.Reset();
		FProjectPtr Selected;
		for (const FGuidonProject& Project : Loaded)
		{
			FProjectPtr Item = MakeShared<FGuidonProject>(Project);
			Self->Projects.Add(Item);
			if (Project.Id == Self->CurrentProjectId) Selected = Item;
		}
		if (!Selected && Self->Projects.Num() > 0)
		{
			Selected = Self->Projects[0];
		}
		Self->CurrentProjectId = Selected ? Selected->Id : FString();
		FGuidonSettings::SetProjectId(Self->CurrentProjectId);

		Self->ProjectCombo->RefreshOptions();
		Self->ProjectCombo->SetSelectedItem(Selected); // same id as CurrentProjectId, so OnProjectSelected is a no-op
		Self->RefreshTasks();
	});
}

void SGuidonTasksWidget::OnProjectSelected(FProjectPtr Project, ESelectInfo::Type SelectInfo)
{
	if (!Project.IsValid() || Project->Id == CurrentProjectId)
	{
		return;
	}
	CurrentProjectId = Project->Id;
	FGuidonSettings::SetProjectId(CurrentProjectId);
	Tasks.Reset();
	SetColumns(GuidonVocabulary::DefaultColumns());
	Comments.Reset();
	SelectedTaskId.Reset();
	AddingInStatus.Reset();
	RebuildBoard();
	RebuildDetails();
	RefreshTasks();
}

void SGuidonTasksWidget::RefreshTasks()
{
	if (CurrentProjectId.IsEmpty())
	{
		Tasks.Reset();
		RebuildBoard();
		RebuildDetails();
		return;
	}

	const FString ProjectId = CurrentProjectId;
	BeginRequest();
	GuidonApi::ListTasks(ProjectId, [Weak = WeakSelf(), ProjectId](bool bOk, const TArray<FGuidonTask>& Loaded, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!Self) return;
		Self->EndRequest();
		if (Self->CurrentProjectId != ProjectId)
		{
			return; // user switched project meanwhile
		}
		if (!bOk)
		{
			Self->SetError(Error);
			return;
		}
		Self->Tasks = Loaded;
		if (!Self->FindTask(Self->SelectedTaskId))
		{
			Self->SelectedTaskId.Reset();
		}
		Self->RebuildBoard();
		Self->RebuildDetails();
		if (!Self->SelectedTaskId.IsEmpty())
		{
			Self->LoadComments(Self->SelectedTaskId);
		}

		Self->BeginRequest();
		GuidonApi::ListColumns(ProjectId, [WeakInner = Self->WeakSelf(), ProjectId](bool bColumnsOk, const TArray<FGuidonColumn>& LoadedColumns, const FString&)
		{
			TSharedPtr<SGuidonTasksWidget> Inner = WeakInner.Pin();
			if (!Inner) return;
			Inner->EndRequest();
			if (Inner->CurrentProjectId != ProjectId)
			{
				return;
			}
			// A failure here (e.g. an older server without the endpoint) just means the default columns.
			Inner->SetColumns(bColumnsOk ? LoadedColumns : GuidonVocabulary::DefaultColumns());
			Inner->RebuildBoard();
			Inner->RebuildDetails();
		});
	});
}

void SGuidonTasksWidget::LoadComments(const FString& TaskId)
{
	BeginRequest();
	GuidonApi::ListComments(TaskId, [Weak = WeakSelf(), TaskId](bool bOk, const TArray<FGuidonComment>& Loaded, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!Self) return;
		Self->EndRequest();
		if (!bOk)
		{
			Self->SetError(Error);
			return;
		}
		Self->Comments.Add(TaskId, Loaded);
		if (Self->SelectedTaskId == TaskId)
		{
			Self->RebuildDetails();
		}
	});
}

void SGuidonTasksWidget::SelectTask(const FString& TaskId)
{
	const FGuidonTask* Task = FindTask(TaskId);
	if (!Task)
	{
		return;
	}
	SelectedTaskId = TaskId;
	EditTitle = Task->Title;
	EditDescription = Task->Description;
	EditPriority = Task->Priority.IsEmpty() ? TEXT("medium") : Task->Priority;
	EditDueDate = Task->DueDate.Left(10);
	NewSubtaskTitle.Reset();
	NewComment.Reset();

	RebuildBoard();
	RebuildDetails();
	LoadComments(TaskId);
}

void SGuidonTasksWidget::MoveTask(const FString& TaskId, const FString& NewStatus)
{
	FGuidonTask* Task = FindTask(TaskId);
	if (!Task || Task->Status == NewStatus)
	{
		return;
	}

	// Optimistic, like the Unity board: move now, revert if the server refuses.
	// A moved top-level card lands at the end of its new column (web board /
	// Unity behaviour); subtasks aren't on the board, so only their status changes.
	const FGuidonTask Previous = *Task;
	const bool bReorder = !Task->IsSubtask();
	double NewSortOrder = Task->SortOrder;
	if (bReorder)
	{
		const TArray<const FGuidonTask*> Column = ColumnTasks(NewStatus);
		NewSortOrder = Column.Num() > 0 ? Column.Last()->SortOrder + 100.0 : 1000.0;
		Task->SortOrder = NewSortOrder;
	}
	Task->Status = NewStatus;
	RebuildBoard();
	RebuildDetails();

	BeginRequest();
	GuidonApi::SetStatus(TaskId, NewStatus, [Weak = WeakSelf(), Previous, bReorder, NewSortOrder](bool bOk, const FGuidonTask& Updated, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!Self) return;
		Self->EndRequest();
		if (!bOk)
		{
			Self->ReplaceTask(Previous);
			Self->SetError(Error);
			Self->RebuildBoard();
			Self->RebuildDetails();
			return;
		}
		if (!bReorder)
		{
			Self->ReplaceTask(Updated);
			Self->RebuildBoard();
			Self->RebuildDetails();
			return;
		}

		Self->BeginRequest();
		GuidonApi::UpdateSortOrder(Updated.Id, NewSortOrder, [WeakInner = Self->WeakSelf()](bool bSortOk, const FGuidonTask& Sorted, const FString& SortError)
		{
			TSharedPtr<SGuidonTasksWidget> Inner = WeakInner.Pin();
			if (!Inner) return;
			Inner->EndRequest();
			if (bSortOk)
			{
				Inner->ReplaceTask(Sorted);
			}
			else
			{
				// The status change already landed - only the position didn't.
				Inner->SetError(SortError);
			}
			Inner->RebuildBoard();
			Inner->RebuildDetails();
		});
	});
}

void SGuidonTasksWidget::CreateTask(const FString& Title, const FString& Status, const FString& ParentTaskId)
{
	BeginRequest();
	GuidonApi::CreateTask(CurrentProjectId, Title, FString(), FString(), FString(), ParentTaskId, Status,
		[Weak = WeakSelf()](bool bOk, const FGuidonTask& Created, const FString& Error)
		{
			TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
			if (!Self) return;
			Self->EndRequest();
			if (!bOk)
			{
				Self->SetError(Error);
				return;
			}
			Self->Message.Reset();
			Self->ReplaceTask(Created);
			Self->RebuildBoard();
			Self->RebuildDetails();
		});
}

void SGuidonTasksWidget::SaveSelectedTask()
{
	const FString Title = EditTitle.TrimStartAndEnd();
	if (Title.IsEmpty())
	{
		SetError(TEXT("Title is required."));
		return;
	}
	if (!IsValidDueDate(EditDueDate))
	{
		SetError(TEXT("Due date must be YYYY-MM-DD (or empty)."));
		return;
	}

	BeginRequest();
	GuidonApi::UpdateTaskFields(SelectedTaskId, Title, EditDescription, EditPriority, EditDueDate,
		[Weak = WeakSelf()](bool bOk, const FGuidonTask& Updated, const FString& Error)
		{
			TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
			if (!Self) return;
			Self->EndRequest();
			if (!bOk)
			{
				Self->SetError(Error);
				return;
			}
			Self->Message.Reset();
			Self->ReplaceTask(Updated);
			Self->RebuildBoard();
		});
}

void SGuidonTasksWidget::DeleteSelectedTask()
{
	const FGuidonTask* Task = FindTask(SelectedTaskId);
	if (!Task)
	{
		return;
	}
	const FText Prompt = FText::Format(
		LOCTEXT("ConfirmDelete", "Delete \"{0}\"? Its subtasks and comments are deleted too."), FText::FromString(Task->Title));
	if (FMessageDialog::Open(EAppMsgType::YesNo, Prompt) != EAppReturnType::Yes)
	{
		return;
	}

	const FString TaskId = Task->Id;
	BeginRequest();
	GuidonApi::DeleteTask(TaskId, [Weak = WeakSelf(), TaskId](bool bOk, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!Self) return;
		Self->EndRequest();
		if (!bOk)
		{
			Self->SetError(Error);
			return;
		}
		// Subtasks go with their parent (ON DELETE CASCADE, migration 010).
		Self->Tasks.RemoveAll([&TaskId](const FGuidonTask& T) { return T.Id == TaskId || T.ParentTaskId == TaskId; });
		Self->Comments.Remove(TaskId);
		if (Self->SelectedTaskId == TaskId)
		{
			Self->SelectedTaskId.Reset();
		}
		Self->RebuildBoard();
		Self->RebuildDetails();
	});
}

void SGuidonTasksWidget::PostComment()
{
	const FString Content = NewComment.TrimStartAndEnd();
	if (Content.IsEmpty() || SelectedTaskId.IsEmpty())
	{
		return;
	}

	const FString TaskId = SelectedTaskId;
	BeginRequest();
	GuidonApi::AddComment(TaskId, Content, [Weak = WeakSelf(), TaskId](bool bOk, const FGuidonComment& Comment, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!Self) return;
		Self->EndRequest();
		if (!bOk)
		{
			Self->SetError(Error);
			return;
		}
		Self->Message.Reset();
		Self->Comments.FindOrAdd(TaskId).Add(Comment);
		if (Self->SelectedTaskId == TaskId)
		{
			Self->NewComment.Reset();
			Self->RebuildDetails();
		}
	});
}

void SGuidonTasksWidget::Login()
{
	Message.Reset();
	FGuidonSettings::SetBaseUrl(BaseUrlEdit.TrimStartAndEnd());
	FGuidonAuth::Login(BaseUrlEdit, [Weak = WeakSelf()](bool bOk, const FString& ApiKey, const FString& Email, const FString& Error)
	{
		TSharedPtr<SGuidonTasksWidget> Self = Weak.Pin();
		if (!bOk)
		{
			if (Self) Self->SetError(Error);
			return;
		}
		FGuidonSettings::SetApiKey(ApiKey);
		FGuidonSettings::SetEmail(Email);
		if (Self)
		{
			Self->RefreshProjects();
		}
	});
}

void SGuidonTasksWidget::LogOut()
{
	FGuidonAuth::Cancel();
	FGuidonSettings::LogOut();
	Projects.Reset();
	Tasks.Reset();
	Comments.Reset();
	SelectedTaskId.Reset();
	AddingInStatus.Reset();
	Message.Reset();
	if (ProjectCombo.IsValid())
	{
		ProjectCombo->RefreshOptions();
	}
	RebuildBoard();
	RebuildDetails();
}

#undef LOCTEXT_NAMESPACE
