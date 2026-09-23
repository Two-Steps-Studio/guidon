#include "GuidonAuth.h"

#include "Containers/Ticker.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "HAL/PlatformProcess.h"
#include "HttpPath.h"
#include "HttpRequestHandler.h"
#include "HttpResultCallback.h"
#include "HttpServerModule.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"
#include "Misc/Guid.h"
#include "Runtime/Launch/Resources/Version.h"

namespace
{
	constexpr uint32 PortRangeStart = 51820;
	constexpr uint32 PortRangeEnd = 51830; // exclusive
	constexpr float TimeoutSeconds = 5.f * 60.f;

	struct FPendingLogin
	{
		TSharedPtr<IHttpRouter> Router;
		FHttpRouteHandle Route;
		FString State;
		FGuidonAuth::FOnLogin Done;
		FTSTicker::FDelegateHandle TimeoutHandle;
	};

	TUniquePtr<FPendingLogin> Pending;

	void Finish(bool bOk, const FString& ApiKey, const FString& Email, const FString& Error)
	{
		if (!Pending)
		{
			return;
		}
		TUniquePtr<FPendingLogin> Login = MoveTemp(Pending);
		if (Login->Router.IsValid() && Login->Route.IsValid())
		{
			// Only our route - the listener itself may be shared with other
			// HTTPServer users (e.g. Remote Control), so it's left running.
			Login->Router->UnbindRoute(Login->Route);
		}
		if (Login->TimeoutHandle.IsValid())
		{
			FTSTicker::GetCoreTicker().RemoveTicker(Login->TimeoutHandle);
		}
		if (Login->Done)
		{
			Login->Done(bOk, ApiKey, Email, Error);
		}
	}

	/** Defers Finish to the next tick - never unbind a route from inside its own handler. */
	void FinishNextTick(bool bOk, const FString& ApiKey, const FString& Email, const FString& Error)
	{
		FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda(
			[bOk, ApiKey, Email, Error](float)
			{
				Finish(bOk, ApiKey, Email, Error);
				return false;
			}));
	}

	FString Param(const FHttpServerRequest& Request, const TCHAR* Name)
	{
		const FString* Value = Request.QueryParams.Find(Name);
		if (!Value)
		{
			return FString();
		}
		return Value->Contains(TEXT("%")) ? FGenericPlatformHttp::UrlDecode(*Value) : *Value;
	}

	bool HandleCallback(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
	{
		const FString ApiKey = Param(Request, TEXT("apiKey"));
		const FString Email = Param(Request, TEXT("email"));
		const bool bOk = Pending && !ApiKey.IsEmpty() && Param(Request, TEXT("state")) == Pending->State;

		const FString Title = bOk ? TEXT("Logged in") : TEXT("Login failed");
		const FString Message = bOk ? TEXT("You're logged in - you can close this tab and return to Unreal Editor.")
									: TEXT("Something went wrong - return to Unreal Editor and try again.");
		const FString Html = FString::Printf(
			TEXT("<html><head><title>Guidon</title></head>")
			TEXT("<body style=\"font-family:sans-serif;text-align:center;padding-top:80px;\">")
			TEXT("<h2>%s</h2><p>%s</p></body></html>"),
			*Title, *Message);
		OnComplete(FHttpServerResponse::Create(Html, TEXT("text/html")));

		FinishNextTick(bOk, bOk ? ApiKey : FString(), bOk ? Email : FString(),
			bOk ? FString() : TEXT("Login was not completed, or the response could not be verified."));
		return true;
	}

	FHttpRequestHandler MakeHandler()
	{
		// FHttpRequestHandler became a delegate in UE 5.4; before that it was a TFunction.
#if ENGINE_MAJOR_VERSION > 5 || (ENGINE_MAJOR_VERSION == 5 && ENGINE_MINOR_VERSION >= 4)
		return FHttpRequestHandler::CreateStatic(&HandleCallback);
#else
		return FHttpRequestHandler(&HandleCallback);
#endif
	}
}

void FGuidonAuth::Login(const FString& InBaseUrl, FOnLogin Done)
{
	Cancel();

	FString BaseUrl = InBaseUrl.TrimStartAndEnd();
	BaseUrl.RemoveFromEnd(TEXT("/"));
	if (BaseUrl.IsEmpty())
	{
		Done(false, FString(), FString(), TEXT("Set a base URL first."));
		return;
	}

	FHttpServerModule& Server = FHttpServerModule::Get();
	// Enables listeners so GetHttpRouter below binds immediately and a
	// port that's already taken fails here rather than silently later.
	Server.StartAllListeners();

	Pending = MakeUnique<FPendingLogin>();
	Pending->State = FGuid::NewGuid().ToString(EGuidFormats::Digits);
	Pending->Done = MoveTemp(Done);

	uint32 BoundPort = 0;
	for (uint32 Port = PortRangeStart; Port < PortRangeEnd; ++Port)
	{
		TSharedPtr<IHttpRouter> Router = Server.GetHttpRouter(Port, /*bFailOnBindFailure*/ true);
		if (!Router.IsValid())
		{
			continue; // in use, e.g. another editor mid-login
		}
		FHttpRouteHandle Route = Router->BindRoute(FHttpPath(TEXT("/callback")), EHttpServerRequestVerbs::VERB_GET, MakeHandler());
		if (!Route.IsValid())
		{
			continue;
		}
		Pending->Router = Router;
		Pending->Route = Route;
		BoundPort = Port;
		break;
	}

	if (BoundPort == 0)
	{
		Finish(false, FString(), FString(),
			FString::Printf(TEXT("Could not open a local port for browser login (tried %u-%u). Close any other Guidon login attempt and try again."),
				PortRangeStart, PortRangeEnd - 1));
		return;
	}

	Pending->TimeoutHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateLambda(
			[](float)
			{
				if (Pending)
				{
					Pending->TimeoutHandle.Reset(); // this ticker removes itself by returning false
				}
				Finish(false, FString(), FString(), TEXT("Login timed out - no response from the browser within 5 minutes."));
				return false;
			}),
		TimeoutSeconds);

	const FString RedirectUri = FString::Printf(TEXT("http://127.0.0.1:%u/callback"), BoundPort);
	const FString Url = FString::Printf(TEXT("%s/auth/plugin-login?redirect_uri=%s&state=%s&client=unreal"), *BaseUrl,
		*FGenericPlatformHttp::UrlEncode(RedirectUri), *Pending->State);

	FString LaunchError;
	FPlatformProcess::LaunchURL(*Url, nullptr, &LaunchError);
	if (!LaunchError.IsEmpty())
	{
		Finish(false, FString(), FString(), TEXT("Could not open a browser: ") + LaunchError);
	}
}

void FGuidonAuth::Cancel()
{
	Finish(false, FString(), FString(), TEXT("Login cancelled."));
}

bool FGuidonAuth::IsInProgress()
{
	return Pending.IsValid();
}
