import { getTranslations } from "next-intl/server";
import { Gamepad2, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      <CardContent>
        <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center">
          <div className="flex gap-3">
            <Gamepad2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
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
