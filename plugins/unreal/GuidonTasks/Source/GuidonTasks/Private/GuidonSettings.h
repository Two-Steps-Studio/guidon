#pragma once

#include "CoreMinimal.h"

/**
 * Machine-wide settings, stored with FPlatformMisc::SetStoredValue (the
 * registry under HKCU\Software\Guidon\GuidonTasks on Windows, a per-user
 * config file elsewhere) rather than in the project's Config/ ini files, so
 * the API key can never be committed to the game's own repo. The trade-off
 * is that it's shared by every project on this machine, the same as the
 * Unity plugin's EditorPrefs.
 */
struct FGuidonSettings
{
	static FString GetBaseUrl();
	static void SetBaseUrl(const FString& Value);

	static FString GetApiKey();
	static void SetApiKey(const FString& Value);

	static FString GetEmail();
	static void SetEmail(const FString& Value);

	/** Last-selected project, restored when the tab reopens. */
	static FString GetProjectId();
	static void SetProjectId(const FString& Value);

	static bool IsConfigured() { return !GetApiKey().IsEmpty() && !GetBaseUrl().IsEmpty(); }

	/** Clears the local key/email. Doesn't revoke the key server-side - Profile > API Keys still lists "Unreal Plugin". */
	static void LogOut();
};
