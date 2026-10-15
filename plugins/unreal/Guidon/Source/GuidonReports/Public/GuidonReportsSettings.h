#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "InputCoreTypes.h"
#include "GuidonReportsSettings.generated.h"

/**
 * Project Settings > Plugins > Guidon Reports. Saved to
 * Config/DefaultGame.ini, which ships with the game - so ReportKey must be
 * a key with ONLY the reports:write scope (Profile > API Keys on the Guidon
 * website): assume players can read it; that scope can file reports and
 * nothing else.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Guidon Reports"))
class GUIDONREPORTS_API UGuidonReportsSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UGuidonReportsSettings() { CategoryName = TEXT("Plugins"); }

	/** Your Guidon instance, e.g. https://useguidon.com */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon")
	FString BaseUrl = TEXT("https://useguidon.com");

	/** The project reports go to - the id in the project's URL (/projects/<id>/...). */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon")
	FString ProjectId;

	/** API key with only the reports:write scope. Ships inside the build. */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon")
	FString ReportKey;

	/** Key that opens the report form. F9 rather than F8: in the editor, F8 is Play-In-Editor's "eject". */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon")
	FKey Hotkey = EKeys::F9;

	/** Off by default: the reporter only runs outside Shipping builds. Turn on for public playtests/early access. */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon")
	bool bEnabledInShipping = false;

	/** Pause the game while the form is open. */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon")
	bool bPauseWhileOpen = true;

	/** How many recent log lines to attach as log.txt (logging is compiled out of Shipping builds). */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon", meta = (ClampMin = 0, ClampMax = 2000))
	int32 LogLines = 300;

	/** JPEG quality of the attached screenshot. */
	UPROPERTY(Config, EditAnywhere, Category = "Guidon", meta = (ClampMin = 30, ClampMax = 100))
	int32 ScreenshotQuality = 85;

	bool IsConfigured() const { return !BaseUrl.IsEmpty() && !ProjectId.IsEmpty() && !ReportKey.IsEmpty(); }
};
