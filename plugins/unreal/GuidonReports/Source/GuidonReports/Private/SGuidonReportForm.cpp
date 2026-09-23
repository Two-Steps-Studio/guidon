#include "GuidonReportsInternal.h"

#include "Brushes/SlateColorBrush.h"
#include "Framework/Application/SlateApplication.h"
#include "GuidonReportsSubsystem.h"
#include "Misc/ConfigCacheIni.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SMultiLineEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "GuidonReports"

namespace
{
	// Same palette as the Guidon web app's dark theme (src/app/globals.css).
	const FLinearColor BackdropColor(0.f, 0.f, 0.f, 0.55f);
	const FLinearColor PanelColor = FLinearColor(FColor::FromHex(TEXT("#101317")));
	const FLinearColor TextColor = FLinearColor(FColor::FromHex(TEXT("#e8eaed")));
	const FLinearColor MutedColor = FLinearColor(FColor::FromHex(TEXT("#8b93a1")));
	const FLinearColor ErrorColor = FLinearColor(FColor::FromHex(TEXT("#f87171")));
	const FLinearColor SuccessColor = FLinearColor(FColor::FromHex(TEXT("#34d399")));

	const FSlateBrush* ColorBrush(const FLinearColor& Color)
	{
		static TMap<uint32, TUniquePtr<FSlateColorBrush>> Brushes;
		TUniquePtr<FSlateColorBrush>& Brush = Brushes.FindOrAdd(GetTypeHash(Color));
		if (!Brush)
		{
			Brush = MakeUnique<FSlateColorBrush>(Color);
		}
		return Brush.Get();
	}

	TSharedRef<STextBlock> Label(const FText& InText, bool bMuted = true)
	{
		return SNew(STextBlock)
			.Text(InText)
			.Font(FCoreStyle::GetDefaultFontStyle("Regular", 10))
			.ColorAndOpacity(FSlateColor(bMuted ? MutedColor : TextColor));
	}

	const TCHAR* ReporterConfigSection = TEXT("GuidonReports");
}

void SGuidonReportForm::Construct(const FArguments& InArgs)
{
	Owner = InArgs._Owner;
	bHasScreenshot = InArgs._HasScreenshot;
	bAttachScreenshot = bHasScreenshot;

	FString SavedReporter;
	GConfig->GetString(ReporterConfigSection, TEXT("Reporter"), SavedReporter, GGameUserSettingsIni);

	auto CategoryButton = [this](const FString& Value, const FText& ButtonText)
	{
		return SNew(SCheckBox)
			.Style(FCoreStyle::Get(), "ToggleButtonCheckbox")
			.IsChecked_Lambda([this, Value]() { return Category == Value ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
			.OnCheckStateChanged_Lambda([this, Value](ECheckBoxState) { Category = Value; })
			[
				SNew(SBox).Padding(FMargin(12.f, 4.f))[SNew(STextBlock).Text(ButtonText)]
			];
	};

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(ColorBrush(BackdropColor))
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(540.f)
			[
				SNew(SBorder)
				.BorderImage(ColorBrush(PanelColor))
				.Padding(20.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(STextBlock)
						.Text(LOCTEXT("FormTitle", "Report a problem"))
						.Font(FCoreStyle::GetDefaultFontStyle("Bold", 14))
						.ColorAndOpacity(FSlateColor(TextColor))
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 12.f, 0.f, 0.f)
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)[CategoryButton(TEXT("bug"), LOCTEXT("Bug", "Bug"))]
						+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)[CategoryButton(TEXT("crash"), LOCTEXT("Crash", "Crash"))]
						+ SHorizontalBox::Slot().AutoWidth()[CategoryButton(TEXT("feedback"), LOCTEXT("Feedback", "Feedback"))]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 12.f, 0.f, 4.f)[Label(LOCTEXT("TitleLabel", "What happened? (short title)"))]
					+ SVerticalBox::Slot().AutoHeight()
					[
						SAssignNew(TitleBox, SEditableTextBox)
						.OnTextCommitted_Lambda([this](const FText&, ETextCommit::Type Commit)
						{
							if (Commit == ETextCommit::OnEnter) OnSend();
						})
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 10.f, 0.f, 4.f)[Label(LOCTEXT("DescriptionLabel", "Details - what did you do, what did you expect?"))]
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SBox).MinDesiredHeight(110.f)[SAssignNew(DescriptionBox, SMultiLineEditableTextBox).AutoWrapText(true)]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 10.f, 0.f, 4.f)[Label(LOCTEXT("ReporterLabel", "Your name or email (optional)"))]
					+ SVerticalBox::Slot().AutoHeight()
					[
						SAssignNew(ReporterBox, SEditableTextBox).Text(FText::FromString(SavedReporter))
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 10.f, 0.f, 0.f)
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 16.f, 0.f)
						[
							SNew(SCheckBox)
							.IsEnabled(bHasScreenshot)
							.IsChecked_Lambda([this]() { return bAttachScreenshot ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
							.OnCheckStateChanged_Lambda([this](ECheckBoxState State) { bAttachScreenshot = State == ECheckBoxState::Checked; })
							[Label(LOCTEXT("AttachScreenshot", "Attach screenshot"), false)]
						]
						+ SHorizontalBox::Slot().AutoWidth()
						[
							SNew(SCheckBox)
							.IsChecked_Lambda([this]() { return bAttachLog ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
							.OnCheckStateChanged_Lambda([this](ECheckBoxState State) { bAttachLog = State == ECheckBoxState::Checked; })
							[Label(LOCTEXT("AttachLog", "Attach log"), false)]
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 10.f, 0.f, 0.f)
					[
						SNew(STextBlock)
						.AutoWrapText(true)
						.Text_Lambda([this]() { return Status; })
						.ColorAndOpacity_Lambda([this]() { return FSlateColor(bStatusIsError ? ErrorColor : SuccessColor); })
						.Visibility_Lambda([this]() { return Status.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 14.f, 0.f, 0.f).HAlign(HAlign_Right)
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 8.f, 0.f)
						[
							SNew(SButton)
							.IsEnabled_Lambda([this]() { return !bSending; })
							.Text(LOCTEXT("Cancel", "Cancel"))
							.OnClicked(this, &SGuidonReportForm::OnCancel)
						]
						+ SHorizontalBox::Slot().AutoWidth()
						[
							SNew(SButton)
							.IsEnabled_Lambda([this]() { return !bSending && TitleBox.IsValid() && !TitleBox->GetText().ToString().TrimStartAndEnd().IsEmpty(); })
							.Text_Lambda([this]() { return bSending ? LOCTEXT("Sending", "Sending\u2026") : LOCTEXT("Send", "Send"); })
							.OnClicked(this, &SGuidonReportForm::OnSend)
						]
					]
				]
			]
		]
	];
}

void SGuidonReportForm::FocusTitle()
{
	if (TitleBox.IsValid())
	{
		FSlateApplication::Get().SetKeyboardFocus(TitleBox, EFocusCause::SetDirectly);
	}
}

FReply SGuidonReportForm::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	if (InKeyEvent.GetKey() == EKeys::Escape && !bSending)
	{
		return OnCancel();
	}
	return FReply::Unhandled();
}

FReply SGuidonReportForm::OnSend()
{
	UGuidonReportsSubsystem* Subsystem = Owner.Get();
	const FString Title = TitleBox.IsValid() ? TitleBox->GetText().ToString().TrimStartAndEnd() : FString();
	if (!Subsystem || bSending || Title.IsEmpty())
	{
		return FReply::Handled();
	}

	const FString Reporter = ReporterBox->GetText().ToString().TrimStartAndEnd();
	GConfig->SetString(ReporterConfigSection, TEXT("Reporter"), *Reporter, GGameUserSettingsIni);

	bSending = true;
	Status = FText::GetEmpty();
	TWeakPtr<SGuidonReportForm> WeakSelf = StaticCastSharedRef<SGuidonReportForm>(AsShared());
	Subsystem->SendFromForm(Title, DescriptionBox->GetText().ToString(), Category, Reporter, bAttachScreenshot, bAttachLog,
		[WeakSelf](bool bOk, const FString& Message)
		{
			TSharedPtr<SGuidonReportForm> Self = WeakSelf.Pin();
			if (!Self) return;
			Self->bSending = false;
			Self->Status = FText::FromString(Message);
			Self->bStatusIsError = !bOk;
			if (bOk)
			{
				if (UGuidonReportsSubsystem* Sub = Self->Owner.Get())
				{
					Sub->CloseReportForm();
				}
			}
		});
	return FReply::Handled();
}

FReply SGuidonReportForm::OnCancel()
{
	if (UGuidonReportsSubsystem* Subsystem = Owner.Get())
	{
		Subsystem->CloseReportForm();
	}
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
