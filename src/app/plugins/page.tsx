import { getTranslations } from "next-intl/server";
import { Code2, Download, ExternalLink, Gamepad2, Monitor, Palette } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/current-user";
import { SITE_URL } from "@/lib/site-url";
import catalog from "../../../plugins/catalog.json";

const REPO_URL = "https://github.com/Two-Steps-Studio/guidon";
// The latest published release is always a desktop one (desktop/RELEASING.md),
// so this stays right without a version in the URL.
const DESKTOP_DOWNLOAD_URL = `${REPO_URL}/releases/latest`;

type PluginId = "unity" | "unreal" | "godot" | "blender" | "vscode" | "jetbrains";
type Category = "engines" | "creative" | "editors";
type DownloadKind = "tasks" | "reports" | "source";

interface CatalogPlugin {
  id: PluginId;
  name: string;
  category: Category;
  requires: string | null;
  readme: string;
  downloads: { id: string; kind: DownloadKind; file: string }[];
}

const PLUGINS = catalog.plugins as CatalogPlugin[];

// Literal key lists, not `install.${id}.s${n}` template strings - next-intl's
// typed t() only accepts keys it can see statically.
const INSTALL_STEPS = {
  unity: ["install.unity.s1", "install.unity.s2", "install.unity.s3"],
  unreal: ["install.unreal.s1", "install.unreal.s2", "install.unreal.s3"],
  godot: ["install.godot.s1", "install.godot.s2", "install.godot.s3"],
  blender: ["install.blender.s1", "install.blender.s2", "install.blender.s3"],
  vscode: ["install.vscode.s1", "install.vscode.s2", "install.vscode.s3"],
  jetbrains: ["install.jetbrains.s1", "install.jetbrains.s2", "install.jetbrains.s3"],
} as const satisfies Record<PluginId, readonly string[]>;

const CATEGORIES = [
  { id: "engines", titleKey: "categories.engines", icon: Gamepad2 },
  { id: "creative", titleKey: "categories.creative", icon: Palette },
  { id: "editors", titleKey: "categories.editors", icon: Code2 },
] as const;

const KIND_KEYS = {
  tasks: "kinds.tasks",
  reports: "kinds.reports",
  source: "kinds.source",
} as const satisfies Record<DownloadKind, string>;

export default async function PluginsPage() {
  const t = await getTranslations("plugins");
  const user = await getCurrentUser();

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">{t("subtitle")}</p>
        </div>

        <Card className="mb-10">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Monitor className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
              <div>
                <CardTitle>{t("desktop.title")}</CardTitle>
                <CardDescription className="mt-1 max-w-2xl">{t("desktop.description")}</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" aria-hidden />
                  {t("desktop.download")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`${REPO_URL}/releases?q=desktop`} target="_blank" rel="noopener noreferrer">
                  {t("desktop.releases")}
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-10">
          {CATEGORIES.map((category) => (
            <section key={category.id} aria-labelledby={`plugins-${category.id}`}>
              <h2
                id={`plugins-${category.id}`}
                className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"
              >
                <category.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                {t(category.titleKey)}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {PLUGINS.filter((plugin) => plugin.category === category.id).map((plugin) => (
                  <Card key={plugin.id} className="flex h-full flex-col">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        {plugin.name}
                        {plugin.requires && (
                          <Badge variant="secondary" className="font-normal">
                            {plugin.requires}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{t(`descriptions.${plugin.id}`)}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                        {INSTALL_STEPS[plugin.id].map((key) => (
                          <li key={key}>{t(key, { baseUrl: SITE_URL })}</li>
                        ))}
                      </ol>
                      <div className="mt-auto flex flex-wrap gap-2">
                        {plugin.downloads.map((download) => (
                          <Button key={download.id} asChild size="sm">
                            <a href={`/downloads/plugins/${download.file}`} download>
                              <Download className="h-4 w-4" aria-hidden />
                              {t(KIND_KEYS[download.kind])}
                            </a>
                          </Button>
                        ))}
                        <Button asChild size="sm" variant="ghost">
                          <a href={`${REPO_URL}/blob/main/${plugin.readme}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" aria-hidden />
                            {t("docs")}
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}

          <section aria-labelledby="plugins-desktop">
            <h2 id="plugins-desktop" className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Monitor className="h-5 w-5 text-muted-foreground" aria-hidden />
              {t("categories.desktop")}
            </h2>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {t("desktop.title")}
                  <Badge variant="secondary" className="font-normal">
                    Windows 10/11
                  </Badge>
                </CardTitle>
                <CardDescription>{t("desktop.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm" variant="outline">
                  <a href={`${REPO_URL}/releases`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    {t("desktop.releases")}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </section>

          <p className="text-sm text-muted-foreground">{t("footer")}</p>
        </div>
      </div>
    </AppShell>
  );
}
