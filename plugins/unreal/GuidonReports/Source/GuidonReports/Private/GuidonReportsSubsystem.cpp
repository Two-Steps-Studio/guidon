#include "GuidonReportsSubsystem.h"

#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "GuidonReportsInternal.h"
#include "GuidonReportsSettings.h"
#include "HAL/PlatformMisc.h"
#include "HttpModule.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/App.h"
#include "Misc/EngineVersion.h"
#include "Misc/Guid.h"
#include "Modules/ModuleManager.h"
#include "UnrealClient.h"
#include "Widgets/SViewport.h"

// --- FGuidonLogCapture -----------------------------------------------------------

void FGuidonLogCapture::Serialize(const TCHAR* Message, ELogVerbosity::Type Verbosity, const FName& Category)
{
	if (MaxLines <= 0 || !Message)
	{
		return;
	}
	const FString Line = FString::Printf(TEXT("%s [%s] %s: %s"), *FDateTime::Now().ToString(TEXT("%H:%M:%S.%s")),
		ToString(Verbosity), *Category.ToString(), Message);

	FScopeLock ScopeLock(&Lock);
	if (Lines.Num() < MaxLines)
	{
		Lines.Add(Line);
	}
	else
	{
		Lines[Next] = Line;
		Next = (Next + 1) % MaxLines;
	}
}

FString FGuidonLogCapture::Snapshot() const
{
	FScopeLock ScopeLock(&Lock);
	FString Out;
	for (int32 i = 0; i < Lines.Num(); ++i)
	{
		Out += Lines[(Next + i) % Lines.Num()];
		Out += TEXT("\n");
	}
	return Out;
}

// --- FGuidonHotkeyProcessor ---------------------------------------------------------

bool FGuidonHotkeyProcessor::HandleKeyDownEvent(FSlateApplication& SlateApp, const FKeyEvent& InKeyEvent)
{
	UGuidonReportsSubsystem* Subsystem = Owner.Get();
	if (!Subsystem || InKeyEvent.GetKey() != Hotkey || InKeyEvent.IsRepeat() || Subsystem->IsReportFormOpen())
	{
		return false;
	}

	// Only while the game has focus - in the editor that keeps PIE/editor shortcuts intact.
	UGameViewportClient* ViewportClient = Subsystem->GetGameInstance() ? Subsystem->GetGameInstance()->GetGameViewportClient() : nullptr;
	TSharedPtr<SViewport> ViewportWidget = ViewportClient ? ViewportClient->GetGameViewportWidget() : nullptr;
	if (!ViewportWidget.IsValid() || !ViewportWidget->HasAnyUserFocusOrFocusedDescendants())
	{
		return false;
	}

	Subsystem->OpenReportForm();
	return true;
}

// --- helpers ------------------------------------------------------------------------

namespace
{
	FString EscapeJson(const FString& In)
	{
		FString Out;
		Out.Reserve(In.Len() + 8);
		for (TCHAR C : In)
		{
			switch (C)
			{
			case TEXT('"'): Out += TEXT("\\\""); break;
			case TEXT('\\'): Out += TEXT("\\\\"); break;
			case TEXT('\n'): Out += TEXT("\\n"); break;
			case TEXT('\r'): Out += TEXT("\\r"); break;
			case TEXT('\t'): Out += TEXT("\\t"); break;
			default:
				if (C < 0x20)
				{
					Out += FString::Printf(TEXT("\\u%04x"), static_cast<int32>(C));
				}
				else
				{
					Out.AppendChar(C);
				}
			}
		}
		return Out;
	}

	FString ToJsonObject(const TMap<FString, FString>& Values)
	{
		FString Out = TEXT("{");
		bool bFirst = true;
		for (const TPair<FString, FString>& Pair : Values)
		{
			if (Pair.Key.IsEmpty()) continue;
			if (!bFirst) Out += TEXT(",");
			bFirst = false;
			Out += FString::Printf(TEXT("\"%s\":\"%s\""), *EscapeJson(Pair.Key), *EscapeJson(Pair.Value));
		}
		return Out + TEXT("}");
	}

	void AppendUtf8(TArray<uint8>& Body, const FString& Text)
	{
		FTCHARToUTF8 Converted(*Text);
		Body.Append(reinterpret_cast<const uint8*>(Converted.Get()), Converted.Length());
	}

	void AppendField(TArray<uint8>& Body, const FString& Boundary, const FString& Name, const FString& Value)
	{
		AppendUtf8(Body, FString::Printf(TEXT("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n"), *Boundary, *Name));
		AppendUtf8(Body, Value);
		AppendUtf8(Body, TEXT("\r\n"));
	}

	void AppendFile(TArray<uint8>& Body, const FString& Boundary, const FString& FileName, const FString& ContentType, const TArray<uint8>& Bytes)
	{
		AppendUtf8(Body, FString::Printf(TEXT("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n"),
			*Boundary, *FileName, *ContentType));
		Body.Append(Bytes);
		AppendUtf8(Body, TEXT("\r\n"));
	}

	FString ExtractError(const FString& Body)
	{
		// {"error":"..."} - a tiny parse instead of a Json module dependency.
		const int32 Key = Body.Find(TEXT("\"error\""));
		if (Key == INDEX_NONE) return FString();
		const int32 Start = Body.Find(TEXT("\""), ESearchCase::CaseSensitive, ESearchDir::FromStart, Body.Find(TEXT(":"), ESearchCase::CaseSensitive, ESearchDir::FromStart, Key) + 1);
		if (Start == INDEX_NONE) return FString();
		FString Out;
		for (int32 i = Start + 1; i < Body.Len(); ++i)
		{
			if (Body[i] == TEXT('\\') && i + 1 < Body.Len()) { Out.AppendChar(Body[++i]); continue; }
			if (Body[i] == TEXT('"')) break;
			Out.AppendChar(Body[i]);
		}
		return Out;
	}
}

// --- lifecycle ----------------------------------------------------------------------

bool UGuidonReportsSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (IsRunningDedicatedServer() || IsRunningCommandlet())
	{
		return false;
	}
	const UGuidonReportsSettings* Settings = GetDefault<UGuidonReportsSettings>();
#if UE_BUILD_SHIPPING
	if (!Settings->bEnabledInShipping)
	{
		return false;
	}
#endif
	return Settings->IsConfigured();
}

void UGuidonReportsSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	const UGuidonReportsSettings* Settings = GetDefault<UGuidonReportsSettings>();

	LogCapture = MakeShared<FGuidonLogCapture>(Settings->LogLines);
	if (GLog)
	{
		GLog->AddOutputDevice(LogCapture.Get());
	}

	if (FSlateApplication::IsInitialized())
	{
		HotkeyProcessor = MakeShared<FGuidonHotkeyProcessor>(this, Settings->Hotkey);
		FSlateApplication::Get().RegisterInputPreProcessor(HotkeyProcessor);
	}
}

void UGuidonReportsSubsystem::Deinitialize()
{
	CloseReportForm();
	if (ScreenshotHandle.IsValid())
	{
		UGameViewportClient::OnScreenshotCaptured().Remove(ScreenshotHandle);
		ScreenshotHandle.Reset();
	}
	if (HotkeyProcessor.IsValid() && FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().UnregisterInputPreProcessor(HotkeyProcessor);
	}
	HotkeyProcessor.Reset();
	if (GLog && LogCapture.IsValid())
	{
		GLog->RemoveOutputDevice(LogCapture.Get());
	}
	LogCapture.Reset();
	Super::Deinitialize();
}

// --- screenshot ---------------------------------------------------------------------

void UGuidonReportsSubsystem::CaptureScreenshot(TFunction<void(TArray<uint8>)> OnCaptured)
{
	UGameViewportClient* ViewportClient = GetGameInstance() ? GetGameInstance()->GetGameViewportClient() : nullptr;
	if (!ViewportClient || ScreenshotCallback)
	{
		OnCaptured(TArray<uint8>());
		return;
	}
	ScreenshotCallback = MoveTemp(OnCaptured);
	ScreenshotHandle = UGameViewportClient::OnScreenshotCaptured().AddUObject(this, &UGuidonReportsSubsystem::OnScreenshotCaptured);
	FScreenshotRequest::RequestScreenshot(/*bInShowUI*/ false);
}

void UGuidonReportsSubsystem::OnScreenshotCaptured(int32 Width, int32 Height, const TArray<FColor>& Pixels)
{
	UGameViewportClient::OnScreenshotCaptured().Remove(ScreenshotHandle);
	ScreenshotHandle.Reset();

	TArray<uint8> Jpeg;
	if (Width > 0 && Height > 0 && Pixels.Num() == Width * Height)
	{
		IImageWrapperModule& ImageWrapperModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
		TSharedPtr<IImageWrapper> Wrapper = ImageWrapperModule.CreateImageWrapper(EImageFormat::JPEG);
		if (Wrapper.IsValid() && Wrapper->SetRaw(Pixels.GetData(), Pixels.Num() * sizeof(FColor), Width, Height, ERGBFormat::BGRA, 8))
		{
			const TArray64<uint8> Compressed = Wrapper->GetCompressed(GetDefault<UGuidonReportsSettings>()->ScreenshotQuality);
			Jpeg.Append(Compressed.GetData(), static_cast<int32>(Compressed.Num()));
		}
	}

	TFunction<void(TArray<uint8>)> Callback = MoveTemp(ScreenshotCallback);
	ScreenshotCallback = nullptr;
	if (Callback)
	{
		Callback(MoveTemp(Jpeg));
	}
}

// --- form ---------------------------------------------------------------------------

void UGuidonReportsSubsystem::OpenReportForm()
{
	if (FormWidget.IsValid())
	{
		return;
	}
	TWeakObjectPtr<UGuidonReportsSubsystem> WeakThis(this);
	// Capture first, so the form itself isn't in the screenshot.
	CaptureScreenshot([WeakThis](TArray<uint8> Jpeg)
	{
		if (UGuidonReportsSubsystem* Self = WeakThis.Get())
		{
			Self->PendingScreenshot = MoveTemp(Jpeg);
			Self->ShowForm();
		}
	});
}

void UGuidonReportsSubsystem::ShowForm()
{
	UGameViewportClient* ViewportClient = GetGameInstance() ? GetGameInstance()->GetGameViewportClient() : nullptr;
	if (!ViewportClient || FormWidget.IsValid())
	{
		return;
	}

	FormWidget = SNew(SGuidonReportForm).Owner(this).HasScreenshot(PendingScreenshot.Num() > 0);
	FormContainer = FormWidget;
	ViewportClient->AddViewportWidgetContent(FormContainer.ToSharedRef(), 10000);

	if (APlayerController* PC = GetGameInstance()->GetFirstLocalPlayerController())
	{
		FInputModeUIOnly InputMode;
		InputMode.SetWidgetToFocus(FormWidget);
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		PC->SetInputMode(InputMode);
		PC->SetShowMouseCursor(true);
	}
	if (GetDefault<UGuidonReportsSettings>()->bPauseWhileOpen && GetWorld() && !UGameplayStatics::IsGamePaused(GetWorld()))
	{
		bPausedByForm = UGameplayStatics::SetGamePaused(GetWorld(), true);
	}
	FormWidget->FocusTitle();
}

void UGuidonReportsSubsystem::CloseReportForm()
{
	if (!FormWidget.IsValid())
	{
		return;
	}
	if (UGameViewportClient* ViewportClient = GetGameInstance() ? GetGameInstance()->GetGameViewportClient() : nullptr)
	{
		ViewportClient->RemoveViewportWidgetContent(FormContainer.ToSharedRef());
	}
	FormWidget.Reset();
	FormContainer.Reset();
	PendingScreenshot.Reset();

	// Back to what a typical game uses; games with a different input setup can re-apply theirs on this.
	if (APlayerController* PC = GetGameInstance() ? GetGameInstance()->GetFirstLocalPlayerController() : nullptr)
	{
		PC->SetInputMode(FInputModeGameOnly());
		PC->SetShowMouseCursor(false);
	}
	if (bPausedByForm && GetWorld())
	{
		UGameplayStatics::SetGamePaused(GetWorld(), false);
	}
	bPausedByForm = false;
}

void UGuidonReportsSubsystem::SendFromForm(const FString& Title, const FString& Description, const FString& Category, const FString& Reporter,
	bool bAttachScreenshot, bool bAttachLog, TFunction<void(bool, const FString&)> OnDone)
{
	Send(Title, Description, Category, Reporter, BuildMetadata({}), bAttachScreenshot ? PendingScreenshot : TArray<uint8>(), bAttachLog, MoveTemp(OnDone));
}

void UGuidonReportsSubsystem::SubmitReport(const FString& Title, const FString& Description, const FString& Category,
	const TMap<FString, FString>& Metadata, bool bAttachScreenshot, const FGuidonReportResult& OnDone)
{
	TWeakObjectPtr<UGuidonReportsSubsystem> WeakThis(this);
	const TMap<FString, FString> AllMetadata = BuildMetadata(Metadata);
	auto SendWith = [WeakThis, Title, Description, Category, AllMetadata, OnDone](TArray<uint8> Jpeg)
	{
		if (UGuidonReportsSubsystem* Self = WeakThis.Get())
		{
			Self->Send(Title, Description, Category, FString(), AllMetadata, Jpeg, true,
				[OnDone](bool bOk, const FString& Message) { OnDone.ExecuteIfBound(bOk, Message); });
		}
	};
	if (bAttachScreenshot)
	{
		CaptureScreenshot(SendWith);
	}
	else
	{
		SendWith(TArray<uint8>());
	}
}

// --- report contents + HTTP -----------------------------------------------------------

TMap<FString, FString> UGuidonReportsSubsystem::BuildMetadata(const TMap<FString, FString>& Extra) const
{
	TMap<FString, FString> Metadata;
	Metadata.Add(TEXT("project"), FApp::GetProjectName());
	Metadata.Add(TEXT("build"), FApp::GetBuildVersion());
	Metadata.Add(TEXT("build_config"), LexToString(FApp::GetBuildConfiguration()));
	Metadata.Add(TEXT("engine"), FEngineVersion::Current().ToString());
	Metadata.Add(TEXT("platform"), FString(FPlatformProperties::IniPlatformName()));
	Metadata.Add(TEXT("os"), FPlatformMisc::GetOSVersion());
	Metadata.Add(TEXT("cpu"), FPlatformMisc::GetCPUBrand().TrimStartAndEnd());
	Metadata.Add(TEXT("gpu"), FPlatformMisc::GetPrimaryGPUBrand());
	Metadata.Add(TEXT("memory_gb"), FString::FromInt(static_cast<int32>(FPlatformMemory::GetConstants().TotalPhysicalGB)));
	Metadata.Add(TEXT("fps"), FString::Printf(TEXT("%.0f"), FApp::GetDeltaTime() > 0.0 ? 1.0 / FApp::GetDeltaTime() : 0.0));

	if (UWorld* World = GetWorld())
	{
		Metadata.Add(TEXT("level"), UGameplayStatics::GetCurrentLevelName(World));
		Metadata.Add(TEXT("game_time_s"), FString::Printf(TEXT("%.0f"), World->GetTimeSeconds()));
	}
	if (UGameViewportClient* ViewportClient = GetGameInstance() ? GetGameInstance()->GetGameViewportClient() : nullptr)
	{
		FVector2D Size;
		ViewportClient->GetViewportSize(Size);
		Metadata.Add(TEXT("resolution"), FString::Printf(TEXT("%dx%d"), static_cast<int32>(Size.X), static_cast<int32>(Size.Y)));
	}
	if (APlayerController* PC = GetGameInstance() ? GetGameInstance()->GetFirstLocalPlayerController() : nullptr)
	{
		if (const APawn* Pawn = PC->GetPawn())
		{
			const FVector Location = Pawn->GetActorLocation();
			Metadata.Add(TEXT("player_location"), FString::Printf(TEXT("%.0f, %.0f, %.0f"), Location.X, Location.Y, Location.Z));
		}
	}

	TMap<FString, FString>& Mutable = Metadata;
	CollectMetadata.Broadcast(Mutable);
	for (const TPair<FString, FString>& Pair : Extra)
	{
		Metadata.Add(Pair.Key, Pair.Value);
	}
	return Metadata;
}

void UGuidonReportsSubsystem::Send(const FString& Title, const FString& Description, const FString& Category, const FString& Reporter,
	const TMap<FString, FString>& Metadata, const TArray<uint8>& Screenshot, bool bAttachLog, TFunction<void(bool, const FString&)> OnDone)
{
	const UGuidonReportsSettings* Settings = GetDefault<UGuidonReportsSettings>();
	FString BaseUrl = Settings->BaseUrl.TrimStartAndEnd();
	BaseUrl.RemoveFromEnd(TEXT("/"));

	const FString Boundary = TEXT("GuidonBoundary") + FGuid::NewGuid().ToString(EGuidFormats::Digits);
	TArray<uint8> Body;
	AppendField(Body, Boundary, TEXT("title"), Title);
	AppendField(Body, Boundary, TEXT("description"), Description);
	AppendField(Body, Boundary, TEXT("category"), Category.IsEmpty() ? FString(TEXT("bug")) : Category);
	AppendField(Body, Boundary, TEXT("metadata"), ToJsonObject(Metadata));
	if (!Reporter.IsEmpty())
	{
		AppendField(Body, Boundary, TEXT("reporter"), Reporter);
	}
	if (Screenshot.Num() > 0)
	{
		AppendFile(Body, Boundary, TEXT("screenshot.jpg"), TEXT("image/jpeg"), Screenshot);
	}
	if (bAttachLog && LogCapture.IsValid())
	{
		const FString Log = LogCapture->Snapshot();
		if (!Log.IsEmpty())
		{
			TArray<uint8> LogBytes;
			AppendUtf8(LogBytes, Log);
			AppendFile(Body, Boundary, TEXT("log.txt"), TEXT("text/plain"), LogBytes);
		}
	}
	AppendUtf8(Body, FString::Printf(TEXT("--%s--\r\n"), *Boundary));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(FString::Printf(TEXT("%s/api/v1/projects/%s/reports"), *BaseUrl, *Settings->ProjectId.TrimStartAndEnd()));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + Settings->ReportKey.TrimStartAndEnd());
	Request->SetHeader(TEXT("Content-Type"), TEXT("multipart/form-data; boundary=") + Boundary);
	Request->SetContent(Body);
	Request->SetTimeout(30.f);
	Request->OnProcessRequestComplete().BindLambda(
		[OnDone = MoveTemp(OnDone)](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnected)
		{
			if (!bConnected || !Response.IsValid())
			{
				OnDone(false, TEXT("Could not reach the Guidon server."));
				return;
			}
			const int32 Code = Response->GetResponseCode();
			if (Code >= 200 && Code < 300)
			{
				OnDone(true, TEXT("Report sent - thank you!"));
				return;
			}
			const FString ServerError = ExtractError(Response->GetContentAsString());
			OnDone(false, FString::Printf(TEXT("%d %s"), Code, ServerError.IsEmpty() ? TEXT("Report failed.") : *ServerError));
		});
	Request->ProcessRequest();
}
