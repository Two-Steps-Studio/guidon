import { getTranslations } from "next-intl/server";
import { Gamepad2, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaudeCodeConnect } from "./claude-code-connect";

// Not packaged as a downloadable .zip on purpose - the plugin lives in this
// same (self-hostable) repo, so linking straight to its folder means the
// linked copy can never drift out of sync with a separately-built archive.
const UNITY_PLUGIN_URL = "https://github.com/Two-Steps-Studio/guidon/tree/main/plugins/unity/GuidonTasks";

export async function IntegrationsSection() {
  const t = await getTranslations("profile");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("integrationsTitle")}</CardTitle>
        <CardDescription>{t("integrationsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ClaudeCodeConnect />
        <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-border bg-background-secondary px-3 py-3 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">{t("unityPluginTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("unityPluginDescription")}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={UNITY_PLUGIN_URL} target="_blank" rel="noreferrer">
              <Github className="mr-2 h-4 w-4" aria-hidden />
              {t("viewOnGithubButton")}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
