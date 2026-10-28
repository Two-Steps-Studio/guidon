"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedClose } from "@/components/ui/use-guarded-close";
import { timeAction } from "@/lib/perf/action-timing";
import { clearTaskDraft, isNetworkError, newTaskId, readTaskDraft, taskDraftKey, writeTaskDraft } from "@/lib/work/task-drafts";
import { quickAddTask } from "./actions";

export interface QuickAddProject {
  id: string;
  name: string;
  color: string | null;
}

type QuickDraft = { title: string; projectId: string; dueToday: boolean };

// The project picked last time is where most quick tasks go next.
const LAST_PROJECT_KEY = "guidon:quick-add-project";

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Quick add on My tasks: a floating button on phones (a header button from
 * `sm` up) that opens title-first capture - type, Enter, done. Project and
 * "due today" are optional; the task is assigned to you so it lands in this
 * list. Unsaved text is kept like the board's dialogs (lib/work/task-drafts).
 */
export function QuickAdd({ userId, projects }: { userId: string; projects: QuickAddProject[] }) {
  const t = useTranslations("myTasks");
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;
  return (
    <>
      <Button className="hidden shrink-0 sm:inline-flex" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {t("quickAdd")}
      </Button>
      <button
        type="button"
        aria-label={t("quickAdd")}
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:hidden"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>
      {open && <QuickAddDialog userId={userId} projects={projects} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickAddDialog({ userId, projects, onClose }: { userId: string; projects: QuickAddProject[]; onClose: () => void }) {
  const t = useTranslations("myTasks");
  const tWork = useTranslations("work");
  const router = useRouter();
  const draftKey = taskDraftKey(userId, "quick-add");
  // Opened by a click, never server-rendered: storage can be read here.
  const [restored] = useState(() => readTaskDraft<QuickDraft>(draftKey, userId));
  const [clientId, setClientId] = useState(() => restored?.clientId ?? newTaskId());
  const [title, setTitle] = useState(restored?.form.title ?? "");
  const [projectId, setProjectId] = useState(() => {
    const preferred = restored?.form.projectId ?? (() => {
      try { return window.localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
    })();
    return projects.some((project) => project.id === preferred) ? preferred! : projects[0].id;
  });
  const [dueToday, setDueToday] = useState(restored?.form.dueToday ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = title.trim() !== "";
  const requestClose = useGuardedClose(dirty, saving, () => { clearTaskDraft(draftKey); onClose(); });

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => writeTaskDraft<QuickDraft>(draftKey, { userId, revision: -1, clientId, form: { title, projectId, dueToday } }), 300);
    return () => window.clearTimeout(timer);
  }, [draftKey, userId, clientId, dirty, title, projectId, dueToday]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await timeAction("task.create", () =>
        quickAddTask(projectId, { title: title.trim(), dueDate: dueToday ? todayKey() : "", clientId })
      );
      if (result.error || !result.task) throw new Error(result.error ?? tWork("failedToCreateTask"));
      clearTaskDraft(draftKey);
      try { window.localStorage.setItem(LAST_PROJECT_KEY, projectId); } catch { /* storage blocked */ }
      const project = projects.find((item) => item.id === projectId);
      // At the top: a toast at the bottom would sit over the floating button
      // on a phone, right when the next quick task is being added.
      toast.success(t("quickAdded", { title: result.task.title, project: project?.name ?? "" }), {
        position: "top-center",
        action: { label: t("openBoard"), onClick: () => router.push(`/projects/${projectId}/work`) },
      });
      // Ready for the next one: a new id, the same project.
      setTitle("");
      setClientId(newTaskId());
      onClose();
      router.refresh();
    } catch (err) {
      setError(isNetworkError(err) ? tWork("networkError") : err instanceof Error ? err.message : tWork("failedToCreateTask"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) void requestClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("quickAdd")}</DialogTitle>
          <DialogDescription>{t("quickAddDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-add-title">{tWork("titleLabel")}</Label>
            <Input
              id="quick-add-title"
              autoFocus
              value={title}
              maxLength={500}
              enterKeyHint="done"
              placeholder={t("quickAddPlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {projects.length > 1 && (
              <SelectMenu
                aria-label={t("quickAddProject")}
                value={projectId}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
                onValueChange={setProjectId}
                className="min-h-11 max-w-full flex-1"
              />
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={dueToday} onChange={(event) => setDueToday(event.target.checked)} />
              {t("quickAddDueToday")}
            </label>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => void requestClose()} disabled={saving}>
              {tWork("cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim() || saving} className="min-h-11">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("quickAddSubmit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
