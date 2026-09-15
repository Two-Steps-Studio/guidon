"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Bot, Check } from "lucide-react";
import { updateAiPermissions, type AiPermissionsState } from "./ai-permissions-actions";

interface AiPermissions {
  can_read_context: boolean;
  can_create_comments: boolean;
  can_change_status: boolean;
  can_complete_tasks: boolean;
  can_modify_settings: boolean;
  can_delete_tasks: boolean;
}

const PERMISSION_KEYS = [
  { field: "can_read_context", labelKey: "permReadContext" },
  { field: "can_create_comments", labelKey: "permCreateComments" },
  { field: "can_change_status", labelKey: "permChangeStatus" },
  { field: "can_complete_tasks", labelKey: "permCompleteTasks" },
  { field: "can_modify_settings", labelKey: "permModifySettings" },
  { field: "can_delete_tasks", labelKey: "permDeleteTasks" },
] as const satisfies { field: keyof AiPermissions; labelKey: string }[];

const initialState: AiPermissionsState = { error: null };

export function AiPermissionsForm({
  projectId,
  permissions,
  allowAutoComplete,
}: {
  projectId: string;
  permissions: AiPermissions;
  allowAutoComplete: boolean;
}) {
  const t = useTranslations("settings");
  const updateWithId = updateAiPermissions.bind(null, projectId);
  const [state, formAction, saving] = useActionState(updateWithId, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          {t("aiPermissionsTitle")}
        </CardTitle>
        <CardDescription>{t("aiPermissionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {PERMISSION_KEYS.map(({ field, labelKey }) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={field}
                  defaultChecked={permissions[field]}
                  className="h-4 w-4"
                />
                {t(labelKey)}
              </label>
            ))}
          </div>

          <div className="rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="allow_ai_auto_complete"
                defaultChecked={allowAutoComplete}
                className="h-4 w-4"
              />
              {t("allowAutoComplete")}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("allowAutoCompleteHelp")}
            </p>
          </div>

          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {state.error}
            </div>
          )}

          <Button type="submit" disabled={saving}>
            <Check className="h-4 w-4 mr-2" />
            {saving ? t("saving") : t("saveAiSettings")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
