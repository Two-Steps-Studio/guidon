#pragma once

#include "Framework/Docking/TabManager.h"
#include "Modules/ModuleManager.h"
#include "Widgets/Docking/SDockTab.h"

/** Registers the "Guidon Tasks" and "Guidon Moodboard" nomad tabs and their Window menu entries. Editor-only module - never ships in a packaged game. */
class FGuidonTasksModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

	static const FName TabName;
	static const FName MoodboardTabName;

private:
	void RegisterMenus();
	TSharedRef<SDockTab> SpawnTab(const FSpawnTabArgs& Args);
	TSharedRef<SDockTab> SpawnMoodboardTab(const FSpawnTabArgs& Args);
};
