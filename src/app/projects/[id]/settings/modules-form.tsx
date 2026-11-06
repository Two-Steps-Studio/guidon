"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROJECT_NAV } from "@/components/layout/app-sidebar";
import { isProjectModule, type ProjectModule } from "@/lib/work/project-modules";
import { updateProjectModules } from "./modules-actions";

// Same icons and labels as the sidebar, so the switch reads as the nav item it hides.
type NavItem = (typeof PROJECT_NAV)[number]["items"][number];
const MODULE_ITEMS = PROJECT_NAV.flatMap((group): readonly NavItem[] => group.items).filter(
  (item): item is NavItem & { href: ProjectModule } => isProjectModule(item.href)
);

/**
 * One switch per module, on = shown. `name` makes each a form field (value =
 * the module, sent only while on), for a form that posts them itself.
 */
export function ModuleSwitches({
  disabled,
  onToggle,
  locked = false,
  name,
}: {
  disabled: ReadonlySet<string>;
  onToggle: (module: string) => void;
  locked?: boolean;
  name?: string;
}) {
  const tNav = useTranslations("nav");
  const tDesc = useTranslations("settings.moduleDescriptions");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MODULE_ITEMS.map((item) => {
        const on = !disabled.has(item.href);
        return (
          <label
            key={item.href}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:disabled]:cursor-default"
          >
            <input
              type="checkbox"
              name={name}
              value={item.href}
              checked={on}
              disabled={locked}
              onChange={() => onToggle(item.href)}
              role="switch"
              aria-describedby={`module-desc-${item.href}`}
              className="switch mt-0.5"
            />
            <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className={on ? "" : "text-muted-foreground line-through"}>{tNav(item.labelKey)}</span>
              <span id={`module-desc-${item.href}`} className="mt-0.5 block text-xs text-muted-foreground">
                {tDesc(item.href)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ModulesForm({
  projectId,
  initialDisabled,
  canManage,
}: {
  projectId: string;
  initialDisabled: string[];
  canManage: boolean;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set(initialDisabled));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (module: string) => {
    setSaved(false);
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateProjectModules(projectId, [...disabled]);
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" />
          {t("modulesTitle")}
        </CardTitle>
        <CardDescription>{t("modulesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ModuleSwitches disabled={disabled} onToggle={toggle} locked={!canManage || pending} />
        <p className="text-xs text-muted-foreground">{t("modulesHint")}</p>
        {canManage ? (
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={pending}>
              {t("modulesSave")}
            </Button>
            {saved && (
              <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="h-4 w-4" />
                {t("modulesSaved")}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("modulesManageHint")}</p>
        )}
        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
