"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAttempt, deleteAttempt, loadAttempts } from "@/app/projects/[id]/work/actions";
import type { AttemptOutcome, TaskAttempt } from "@/types/task";

/**
 * Previous Attempts (TODO.md §22) — a record of what's already been tried
 * on this task and failed, so a human or an AI agent doesn't propose the
 * same dead-end again. Self-contained: loads its own data on mount rather
 * than being fed by the parent dialog, since — unlike subtasks — nothing
 * else in TaskDetailDialog needs to react to an attempt being logged.
 */

const OUTCOME_CONFIG: Record<AttemptOutcome, { label: string; icon: typeof CheckCircle2; color: string }> = {
  failed: { label: "Failed", icon: X, color: "text-destructive" },
  partial: { label: "Partial", icon: AlertTriangle, color: "text-amber-500" },
  succeeded: { label: "Succeeded", icon: CheckCircle2, color: "text-emerald-500" },
};

const EMPTY_FORM = {
  problem: "",
  approach: "",
  outcome: "failed" as AttemptOutcome,
  result: "",
  failure_reason: "",
  files_changed: "",
  related_pr_url: "",
  agent: "",
};

export function TaskAttemptsSection({
  projectId,
  taskId,
  canEdit,
  canDelete,
}: {
  projectId: string;
  taskId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [attempts, setAttempts] = useState<TaskAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const result = await loadAttempts(projectId, taskId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setAttempts(result.attempts);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.problem.trim() || !form.approach.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const result = await createAttempt(projectId, { task_id: taskId, ...form });
      if (result.error || !result.attempt) throw new Error(result.error ?? "Failed to record attempt");

      setAttempts((current) => [result.attempt as TaskAttempt, ...current]);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record attempt");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (attemptId: string) => {
    setDeletingId(attemptId);
    setError(null);

    try {
      const result = await deleteAttempt(projectId, attemptId);
      if (result.error) throw new Error(result.error);

      setAttempts((current) => current.filter((a) => a.id !== attemptId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete attempt");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-label="Previous attempts" className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Previous Attempts
          {attempts.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{attempts.length}</span>
          )}
        </h3>
        {canEdit && !formOpen && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Log attempt
          </Button>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading attempts...
        </p>
      ) : attempts.length === 0 && !formOpen ? (
        <p className="text-sm text-muted-foreground">
          No attempts logged yet. Recording a failed approach here keeps it from being tried again.
        </p>
      ) : (
        <ul className="space-y-2">
          {attempts.map((attempt) => {
            const config = OUTCOME_CONFIG[attempt.outcome];
            const OutcomeIcon = config.icon;

            return (
              <li key={attempt.id} className="group rounded-md border border-border p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <OutcomeIcon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    {attempt.agent && (
                      <span className="text-xs text-muted-foreground">· {attempt.agent}</span>
                    )}
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      aria-label="Delete attempt"
                      disabled={deletingId === attempt.id}
                      onClick={() => void handleDelete(attempt.id)}
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                    >
                      {deletingId === attempt.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">
                  <span className="font-medium">Problem:</span> {attempt.problem}
                </p>
                <p className="mt-0.5 text-sm text-foreground">
                  <span className="font-medium">Approach:</span> {attempt.approach}
                </p>
                {attempt.failure_reason && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <span className="font-medium">Why it failed:</span> {attempt.failure_reason}
                  </p>
                )}
                {attempt.result && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <span className="font-medium">Result:</span> {attempt.result}
                  </p>
                )}
                {attempt.files_changed.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Files: {attempt.files_changed.join(", ")}
                  </p>
                )}
                {attempt.related_pr_url && (
                  <a
                    href={attempt.related_pr_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block text-xs text-primary hover:underline"
                  >
                    {attempt.related_pr_url}
                  </a>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(attempt.created_at).toLocaleDateString()}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {formOpen && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="attempt-problem">Problem</Label>
            <Textarea
              id="attempt-problem"
              rows={2}
              required
              value={form.problem}
              onChange={(event) => setForm({ ...form, problem: event.target.value })}
              placeholder="What were you trying to solve?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attempt-approach">Approach</Label>
            <Textarea
              id="attempt-approach"
              rows={2}
              required
              value={form.approach}
              onChange={(event) => setForm({ ...form, approach: event.target.value })}
              placeholder="What did you try?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="attempt-outcome">Outcome</Label>
              <Select
                id="attempt-outcome"
                value={form.outcome}
                onChange={(event) =>
                  setForm({ ...form, outcome: event.target.value as AttemptOutcome })
                }
              >
                <option value="failed">Failed</option>
                <option value="partial">Partial</option>
                <option value="succeeded">Succeeded</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attempt-agent">Agent</Label>
              <Input
                id="attempt-agent"
                value={form.agent}
                onChange={(event) => setForm({ ...form, agent: event.target.value })}
                placeholder="Claude Code, human, Cursor..."
              />
            </div>
          </div>
          {form.outcome !== "succeeded" && (
            <div className="space-y-1.5">
              <Label htmlFor="attempt-failure-reason">Why it failed</Label>
              <Textarea
                id="attempt-failure-reason"
                rows={2}
                value={form.failure_reason}
                onChange={(event) => setForm({ ...form, failure_reason: event.target.value })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="attempt-result">Result</Label>
            <Textarea
              id="attempt-result"
              rows={2}
              value={form.result}
              onChange={(event) => setForm({ ...form, result: event.target.value })}
              placeholder="What actually happened?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="attempt-files">Files changed</Label>
              <Textarea
                id="attempt-files"
                rows={2}
                value={form.files_changed}
                onChange={(event) => setForm({ ...form, files_changed: event.target.value })}
                placeholder={"One path per line"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attempt-pr">Related PR</Label>
              <Input
                id="attempt-pr"
                type="url"
                value={form.related_pr_url}
                onChange={(event) => setForm({ ...form, related_pr_url: event.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setFormOpen(false);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !form.problem.trim() || !form.approach.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save attempt
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
