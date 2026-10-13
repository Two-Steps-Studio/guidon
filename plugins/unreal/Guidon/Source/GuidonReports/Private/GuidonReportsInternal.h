#pragma once

#include "CoreMinimal.h"
#include "Framework/Application/IInputProcessor.h"
#include "HAL/CriticalSection.h"
#include "InputCoreTypes.h"
#include "Misc/OutputDevice.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Widgets/SCompoundWidget.h"

class UGuidonReportsSubsystem;
class SEditableTextBox;
class SMultiLineEditableTextBox;
class STextBlock;

/** Keeps the last N log lines in memory for log.txt. Thread-safe: GLog calls it from any thread. */
class FGuidonLogCapture : public FOutputDevice
{
public:
	explicit FGuidonLogCapture(int32 InMaxLines) : MaxLines(FMath::Max(0, InMaxLines)) {}

	virtual void Serialize(const TCHAR* Message, ELogVerbosity::Type Verbosity, const FName& Category) override;
	virtual bool CanBeUsedOnAnyThread() const override { return true; }
	virtual bool CanBeUsedOnMultipleThreads() const override { return true; }

	FString Snapshot() const;

private:
	const int32 MaxLines;
	mutable FCriticalSection Lock;
	TArray<FString> Lines;
	int32 Next = 0;
};

/**
 * Opens the form on the hotkey. An input pre-processor sees keys before the
 * game's own bindings, so it works whatever input system the game uses. In
 * the editor it only reacts while the game viewport has focus - PIE keeps
 * its own shortcuts.
 */
class FGuidonHotkeyProcessor : public IInputProcessor
{
public:
	FGuidonHotkeyProcessor(UGuidonReportsSubsystem* InOwner, FKey InHotkey) : Owner(InOwner), Hotkey(InHotkey) {}

	virtual void Tick(const float DeltaTime, FSlateApplication& SlateApp, TSharedRef<ICursor> Cursor) override {}
	virtual bool HandleKeyDownEvent(FSlateApplication& SlateApp, const FKeyEvent& InKeyEvent) override;
	virtual const TCHAR* GetDebugName() const override { return TEXT("GuidonReportsHotkey"); }

private:
	TWeakObjectPtr<UGuidonReportsSubsystem> Owner;
	FKey Hotkey;
};

/** The built-in report form, shown over the game viewport. */
class SGuidonReportForm : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonReportForm) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UGuidonReportsSubsystem>, Owner)
		SLATE_ARGUMENT(bool, HasScreenshot)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	void FocusTitle();

	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;

private:
	FReply OnSend();
	FReply OnCancel();

	TWeakObjectPtr<UGuidonReportsSubsystem> Owner;
	TSharedPtr<SEditableTextBox> TitleBox;
	TSharedPtr<SMultiLineEditableTextBox> DescriptionBox;
	TSharedPtr<SEditableTextBox> ReporterBox;
	FString Category = TEXT("bug");
	bool bAttachScreenshot = true;
	bool bAttachLog = true;
	bool bHasScreenshot = false;
	bool bSending = false;
	FText Status;
	bool bStatusIsError = false;
};
