"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PROJECT_LANGUAGES, languageName } from "@/lib/project-language";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, FolderKanban, Loader2, Settings, X } from "lucide-react";
import { updateProjectSettings, type SettingsFormState } from "./actions";
import type { Project, ProjectStatus, ProjectType, ProjectMethodology } from "@/types/project";
import { Select } from "@/components/ui/select";
import { ImageCropInput } from "@/components/ui/image-crop-input";

const STATUS_VALUES: ProjectStatus[] = ["active", "archived", "deleted"];
const PROJECT_TYPE_VALUES: ProjectType[] = ["game", "website", "mobile_app", "api", "tool", "other"];
const PROJECT_METHODOLOGY_VALUES: ProjectMethodology[] = ["standard", "scrum"];

const initialState: SettingsFormState = { error: null };

export function SettingsForm({
  project,
  initialTechnologies,
}: {
  project: Project;
  initialTechnologies: string[];
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const updateWithId = updateProjectSettings.bind(null, project.id);
  const [state, formAction, saving] = useActionState(updateWithId, initialState);
  const [technologies, setTechnologies] = useState<string[]>(initialTechnologies);
  const [color, setColor] = useState(project.color || "#0f6b5a");

  // useActionState's dispatched result is always a fresh object, never
  // reference-equal to the outer `initialState` constant - so this only
  // skips the very first render (before any submission), same detection
  // `reactedTo` comparisons elsewhere in this codebase use, but in an
  // effect rather than during render since toast() is a real side effect
  // (synchronizing with something outside React), not a state adjustment.
  useEffect(() => {
    if (state === initialState) return;
    if (!state.error) toast.success(t("settingsSavedToast"));
  }, [state, t]);

  const handleTechnologyAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.currentTarget.value.trim()) {
      e.preventDefault();
      const tech = e.currentTarget.value.trim();
      if (!technologies.includes(tech)) {
        setTechnologies([...technologies, tech]);
      }
      e.currentTarget.value = "";
    }
  };

  const handleTechnologyRemove = (tech: string) => {
    setTechnologies(technologies.filter((t) => t !== tech));
  };

  return (
    <form action={formAction} className="space-y-6" data-save-shortcut>
      <input type="hidden" name="technologies" value={JSON.stringify(technologies)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("general")}
          </CardTitle>
          <CardDescription>{t("generalDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("projectImage")}</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-md">
                <AvatarImage src={project.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="rounded-md">
                  <FolderKanban className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <ImageCropInput id="avatar" name="avatar" currentImage={project.avatar_url} />
                <p className="text-xs text-muted-foreground">
                  {t("projectImageHelp")}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input id="name" name="name" defaultValue={project.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("descriptionLabel")}</Label>
            <Textarea id="description" name="description" defaultValue={project.description ?? ""} rows={4} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t("statusLabel")}</Label>
            <Select
              id="status"
              name="status"
              defaultValue={project.status}
            >
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {tCommon("projectStatus", { status: value })}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">{t("languageLabel")}</Label>
            <Select id="language" name="language" defaultValue={project.language ?? ""}>
              <option value="">{t("languageAuto")}</option>
              {PROJECT_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageName(code, locale)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t("languageHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="visibility">{t("visibilityLabel")}</Label>
            <Select
              id="visibility"
              name="visibility"
              defaultValue={project.visibility === "private" ? "private" : "organization"}
            >
              <option value="organization">{t("visibilityOrganization")}</option>
              <option value="private">{t("visibilityPrivate")}</option>
            </Select>
            <p className="text-xs text-muted-foreground">{t("visibilityHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectType">{t("projectTypeLabel")}</Label>
            <Select
              id="projectType"
              name="projectType"
              defaultValue={project.project_type ?? ""}
            >
              <option value="">{t("notSet")}</option>
              {PROJECT_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {tCommon("projectType", { type: value })}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("workflowLabel")}</Label>
            <div className="flex gap-4">
              {PROJECT_METHODOLOGY_VALUES.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="methodology"
                    value={value}
                    defaultChecked={project.methodology === value}
                  />
                  {tCommon("projectMethodology", { methodology: value })}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("workflowHelp")}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="aiEnabled"
                defaultChecked={project.ai_enabled}
                className="h-4 w-4"
              />
              {t("aiEnabledLabel")}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">{t("aiEnabledHelp")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">{t("colorLabel")}</Label>
            <div className="flex items-center gap-3">
              <input
                id="color"
                name="color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-16 rounded cursor-pointer border border-border"
              />
              <Input
                id="colorHex"
                name="colorHex"
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#000000"
                className="flex-1"
                pattern="^#[0-9A-Fa-f]{6}$"
                maxLength={7}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("colorHelp")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="technologiesInput">{t("technologiesLabel")}</Label>
            <Input id="technologiesInput" onKeyDown={handleTechnologyAdd} placeholder={t("technologiesPlaceholder")} />
            {technologies.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {technologies.map((tech) => (
                  <Badge key={tech} variant="secondary" className="flex items-center gap-1">
                    {tech}
                    <button
                      type="button"
                      onClick={() => handleTechnologyRemove(tech)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("saving")}
            </>
          ) : (
            t("saveChanges")
          )}
        </Button>
      </div>
    </form>
  );
}
