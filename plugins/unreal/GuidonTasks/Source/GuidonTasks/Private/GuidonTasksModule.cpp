#include "GuidonTasksModule.h"

#include "Framework/Application/SlateApplication.h"
#include "Framework/Docking/TabManager.h"
#include "GuidonAuth.h"
#include "SGuidonMoodboardWidget.h"
#include "SGuidonTasksWidget.h"
#include "ToolMenus.h"
#include "Widgets/Docking/SDockTab.h"

#define LOCTEXT_NAMESPACE "GuidonTasks"

const FName FGuidonTasksModule::TabName(TEXT("GuidonTasks"));
const FName FGuidonTasksModule::MoodboardTabName(TEXT("GuidonMoodboard"));

void FGuidonTasksModule::StartupModule()
{
	FGlobalTabmanager::Get()
		->RegisterNomadTabSpawner(TabName, FOnSpawnTab::CreateRaw(this, &FGuidonTasksModule::SpawnTab))
		.SetDisplayName(LOCTEXT("TabTitle", "Guidon Tasks"))
		.SetTooltipText(LOCTEXT("TabTooltip", "Guidon project board"))
		.SetMenuType(ETabSpawnerMenuType::Hidden);
	FGlobalTabmanager::Get()
		->RegisterNomadTabSpawner(MoodboardTabName, FOnSpawnTab::CreateRaw(this, &FGuidonTasksModule::SpawnMoodboardTab))
		.SetDisplayName(LOCTEXT("MoodboardTabTitle", "Guidon Moodboard"))
		.SetTooltipText(LOCTEXT("MoodboardTabTooltip", "The Guidon project's reference images"))
		.SetMenuType(ETabSpawnerMenuType::Hidden);

	UToolMenus::RegisterStartupCallback(
		FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FGuidonTasksModule::RegisterMenus));
}

void FGuidonTasksModule::ShutdownModule()
{
	FGuidonAuth::Cancel();
	UToolMenus::UnRegisterStartupCallback(this);
	UToolMenus::UnregisterOwner(this);
	if (FSlateApplication::IsInitialized())
	{
		FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(TabName);
		FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(MoodboardTabName);
	}
}

void FGuidonTasksModule::RegisterMenus()
{
	FToolMenuOwnerScoped OwnerScoped(this);

	UToolMenu* Menu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.Window");
	FToolMenuSection& Section = Menu->AddSection("Guidon", LOCTEXT("MenuSection", "Guidon"));
	Section.AddMenuEntry(
		"OpenGuidonTasks",
		LOCTEXT("MenuEntry", "Guidon Tasks"),
		LOCTEXT("MenuEntryTooltip", "Open the Guidon project board"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]() { FGlobalTabmanager::Get()->TryInvokeTab(FTabId(TabName)); })));
	Section.AddMenuEntry(
		"OpenGuidonMoodboard",
		LOCTEXT("MoodboardMenuEntry", "Guidon Moodboard"),
		LOCTEXT("MoodboardMenuEntryTooltip", "Open the Guidon project's reference images"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]() { FGlobalTabmanager::Get()->TryInvokeTab(FTabId(MoodboardTabName)); })));
}

TSharedRef<SDockTab> FGuidonTasksModule::SpawnTab(const FSpawnTabArgs& Args)
{
	return SNew(SDockTab).TabRole(ETabRole::NomadTab)[SNew(SGuidonTasksWidget)];
}

TSharedRef<SDockTab> FGuidonTasksModule::SpawnMoodboardTab(const FSpawnTabArgs& Args)
{
	return SNew(SDockTab).TabRole(ETabRole::NomadTab)[SNew(SGuidonMoodboardWidget)];
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FGuidonTasksModule, GuidonTasks)
