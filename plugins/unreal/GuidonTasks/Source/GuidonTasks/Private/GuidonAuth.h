#pragma once

#include "CoreMinimal.h"

/**
 * Browser login - the same loopback flow as the Unity plugin's
 * GuidonBrowserAuth.cs (and `gh auth login`): bind a short-lived route on a
 * local port with the engine's HTTPServer module, open
 * /auth/plugin-login?client=unreal in the user's browser with that route
 * as redirect_uri, and receive the issued API key back once they click
 * Authorize. The plugin never sees a password.
 */
class FGuidonAuth
{
public:
	using FOnLogin = TFunction<void(bool bOk, const FString& ApiKey, const FString& Email, const FString& Error)>;

	/** Done runs on the game thread exactly once: success, failure, timeout (5 min) or Cancel(). */
	static void Login(const FString& BaseUrl, FOnLogin Done);
	static void Cancel();
	static bool IsInProgress();
};
