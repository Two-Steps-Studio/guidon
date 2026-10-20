"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { DONE_CLEANUP_OPTIONS } from "@/lib/work/done-cleanup-options";
import { countFinishedTasksOlderThan, updateDoneCleanup } from "./finished-tasks-actions";

/** Project settings: delete finished tasks after a period (migration 061). */
export function FinishedTasksForm({
  projectId,
  initialDays,
  canManage,
}: {
  projectId: string;
  initialDays: number | null;
  canManage: boolean;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [saved, setSaved] = useState(initialDays);
  const [days, setDays] = useState(initialDays);
  // What saving would delete right away - shown before it happens.
  const [preview, setPreview] = useState<{ days: number; count: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (days === null || days === saved || !canManage) return;
    let cancelled = false;
    countFinishedTasksOlderThan(projectId, days).then((count) => {
      if (!cancelled && count !== null) setPreview({ days, count });
    });
    return () => {
      cancelled = true;
    };
  }, [days, saved, projectId, canManage]);

  const pendingDelete = days !== null && days !== saved && preview?.days === days ? preview.count : 0;

  const save = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateDoneCleanup(projectId, days);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(days);
      setMessage(result.deleted > 0 ? t("finishedTasksDeleted", { count: result.deleted }) : t("finishedTasksSaved"));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          {t("finishedTasksTitle")}
        </CardTitle>
        <CardDescription>{t("finishedTasksDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label={t("finishedTasksLabel")}
            className="h-9 w-56"
            value={days === null ? "off" : String(days)}
            disabled={!canManage || pending}
            onChange={(event) => {
              setMessage(null);
              setDays(event.target.value === "off" ? null : Number(event.target.value));
            }}
          >
            <option value="off">{t("finishedTasksOff")}</option>
            {DONE_CLEANUP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t("finishedTasksAfter", { days: option })}
              </option>
            ))}
          </Select>
          {canManage && (
            <Button type="button" onClick={save} disabled={pending || days === saved}>
              {pendingDelete > 0 ? t("finishedTasksSaveAndDelete", { count: pendingDelete }) : t("finishedTasksSave")}
            </Button>
          )}
        </div>
        {pendingDelete > 0 && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {t("finishedTasksWarning", { count: pendingDelete, days: days! })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("finishedTasksHint")}</p>
        {!canManage && <p className="text-sm text-muted-foreground">{t("finishedTasksManageHint")}</p>}
        {message && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="h-4 w-4" />
            {message}
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
