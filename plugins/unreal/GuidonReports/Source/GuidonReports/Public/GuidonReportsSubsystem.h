#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GuidonReportsSubsystem.generated.h"

class FGuidonLogCapture;
class FGuidonHotkeyProcessor;
class SGuidonReportForm;

DECLARE_DYNAMIC_DELEGATE_TwoParams(FGuidonReportResult, bool, bSuccess, const FString&, Message);

/** Add your own fields (player position, quest, save slot...) to every report. */
DECLARE_MULTICAST_DELEGATE_OneParam(FGuidonCollectMetadata, TMap<FString, FString>& /*Metadata*/);

/**
 * The in-game reporter. Press the hotkey (F9 by default) or call
 * OpenReportForm; the report becomes a Guidon task with a screenshot, the
 * recent log and build/platform/level details. Games with their own UI call
 * SubmitReport instead.
 *
 * Runs outside Shipping builds, or in Shipping when bEnabledInShipping is
 * set, and only when the settings are filled in.
 */
UCLASS()
class GUIDONREPORTS_API UGuidonReportsSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Captures the screen, then opens the built-in report form. */
	UFUNCTION(BlueprintCallable, Category = "Guidon")
	void OpenReportForm();

	UFUNCTION(BlueprintPure, Category = "Guidon")
	bool IsReportFormOpen() const { return FormWidget.IsValid(); }

	/**
	 * Sends a report without the built-in form. Category is bug, crash or
	 * feedback. Metadata is merged over the automatic fields.
	 */
	UFUNCTION(BlueprintCallable, Category = "Guidon", meta = (AutoCreateRefTerm = "Metadata,OnDone"))
	void SubmitReport(const FString& Title, const FString& Description, const FString& Category,
		const TMap<FString, FString>& Metadata, bool bAttachScreenshot, const FGuidonReportResult& OnDone);

	/** C++ hook for extra fields on every report. */
	FGuidonCollectMetadata CollectMetadata;

	// Used by the form widget.
	void SendFromForm(const FString& Title, const FString& Description, const FString& Category, const FString& Reporter,
		bool bAttachScreenshot, bool bAttachLog, TFunction<void(bool, const FString&)> OnDone);
	void CloseReportForm();
	bool HasPendingScreenshot() const { return PendingScreenshot.Num() > 0; }

private:
	void CaptureScreenshot(TFunction<void(TArray<uint8>)> OnCaptured);
	void OnScreenshotCaptured(int32 Width, int32 Height, const TArray<FColor>& Pixels);
	void ShowForm();
	TMap<FString, FString> BuildMetadata(const TMap<FString, FString>& Extra) const;
	void Send(const FString& Title, const FString& Description, const FString& Category, const FString& Reporter,
		const TMap<FString, FString>& Metadata, const TArray<uint8>& Screenshot, bool bAttachLog, TFunction<void(bool, const FString&)> OnDone);

	TSharedPtr<FGuidonLogCapture> LogCapture;
	TSharedPtr<FGuidonHotkeyProcessor> HotkeyProcessor;
	TSharedPtr<SGuidonReportForm> FormWidget;
	TSharedPtr<class SWidget> FormContainer;

	TArray<uint8> PendingScreenshot;
	TFunction<void(TArray<uint8>)> ScreenshotCallback;
	FDelegateHandle ScreenshotHandle;

	bool bPausedByForm = false;
};
