#include "GuidonSettings.h"

#include "HAL/PlatformMisc.h"

namespace
{
	const TCHAR* StoreId = TEXT("Guidon");
	const TCHAR* Section = TEXT("GuidonTasks");

	FString Get(const TCHAR* Key, const FString& Default = FString())
	{
		FString Value;
		return FPlatformMisc::GetStoredValue(StoreId, Section, Key, Value) ? Value : Default;
	}

	void Set(const TCHAR* Key, const FString& Value)
	{
		if (Value.IsEmpty())
		{
			FPlatformMisc::DeleteStoredValue(StoreId, Section, Key);
		}
		else
		{
			FPlatformMisc::SetStoredValue(StoreId, Section, Key, Value);
		}
	}
}

FString FGuidonSettings::GetBaseUrl() { return Get(TEXT("BaseUrl"), TEXT("https://useguidon.com")); }
void FGuidonSettings::SetBaseUrl(const FString& Value) { Set(TEXT("BaseUrl"), Value); }

FString FGuidonSettings::GetApiKey() { return Get(TEXT("ApiKey")); }
void FGuidonSettings::SetApiKey(const FString& Value) { Set(TEXT("ApiKey"), Value); }

FString FGuidonSettings::GetEmail() { return Get(TEXT("Email")); }
void FGuidonSettings::SetEmail(const FString& Value) { Set(TEXT("Email"), Value); }

FString FGuidonSettings::GetProjectId() { return Get(TEXT("ProjectId")); }
void FGuidonSettings::SetProjectId(const FString& Value) { Set(TEXT("ProjectId"), Value); }

void FGuidonSettings::LogOut()
{
	SetApiKey(FString());
	SetEmail(FString());
}
