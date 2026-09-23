using UnrealBuildTool;

public class GuidonReports : ModuleRules
{
	public GuidonReports(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "DeveloperSettings", "InputCore" });

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"ApplicationCore",
			"HTTP",
			"ImageWrapper",
		});
	}
}
