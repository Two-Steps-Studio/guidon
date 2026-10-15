using UnrealBuildTool;

public class GuidonTasks : ModuleRules
{
	public GuidonTasks(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core" });

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"CoreUObject",
			"Engine",
			"InputCore",
			"ApplicationCore",
			"Slate",
			"SlateCore",
			"ToolMenus",
			"UnrealEd",
			"HTTP",
			"HTTPServer",
			"Json",
			// Same plugin's runtime module: the board's "Set Up In-Game
			// Reports" writes its UGuidonReportsSettings.
			"GuidonReports",
			"DeveloperSettings",
		});
	}
}
