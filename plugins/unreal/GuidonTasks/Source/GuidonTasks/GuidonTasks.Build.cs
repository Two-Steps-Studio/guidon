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
			"Slate",
			"SlateCore",
			"ToolMenus",
			"UnrealEd",
			"HTTP",
			"HTTPServer",
			"Json",
		});
	}
}
