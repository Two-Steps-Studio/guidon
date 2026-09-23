#pragma once

#include "Framework/Docking/TabManager.h"
#include "Modules/ModuleManager.h"
#include "Widgets/Docking/SDockTab.h"

/** Registers the "Guidon Tasks" nomad tab and its Window menu entry. Editor-only module - never ships in a packaged game. */
class FGuidonTasksModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

	static const FName TabName;

private:
	void RegisterMenus();
	TSharedRef<SDockTab> SpawnTab(const FSpawnTabArgs& Args);
};
