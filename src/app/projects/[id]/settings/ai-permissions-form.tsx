"use client";

import { useActionState } from "react";
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

const PERMISSION_LABELS: { field: keyof AiPermissions; label: string }[] = [
  { field: "can_read_context", label: "Read project context" },
  { field: "can_create_comments", label: "Create comments" },
  { field: "can_change_status", label: "Change task status" },
  { field: "can_complete_tasks", label: "Complete tasks" },
  { field: "can_modify_settings", label: "Modify project settings" },
  { field: "can_delete_tasks", label: "Delete tasks" },
];

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
  const updateWithId = updateAiPermissions.bind(null, projectId);
  const [state, formAction, saving] = useActionState(updateWithId, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Permissions
        </CardTitle>
        <CardDescription>What an AI agent using this project&apos;s API keys is allowed to do.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {PERMISSION_LABELS.map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={field}
                  defaultChecked={permissions[field]}
                  className="h-4 w-4"
                />
                {label}
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
              Allow AI to auto-complete tasks
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Without this, AI can move tasks to Review but a human always makes the final call to Done.
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
            {saving ? "Saving..." : "Save AI Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
