"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Check, Loader2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmAction } from "@/components/ui/confirm-action";
import { APPROVAL_TEXT_MAX, effectiveStatus, type ApprovalRequest, type ApprovalStatus } from "@/lib/work/agent-approvals-core";
import { decideApproval } from "./actions";

const BUILT_IN_STATUSES = new Set(["backlog", "todo", "in_progress", "ai_working", "review", "done"]);

const STATUS_BADGE: Record<ApprovalStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  approved: "secondary",
  rejected: "outline",
  expired: "outline",
  failed: "destructive",
};

/**
 * The project's Approvals inbox: what agents asked to do and couldn't on
 * their own. One request at a time - no bulk approve, on purpose: each one
 * is a separate decision about a separate task.
 */
export function ApprovalInbox({
  projectId,
  requests: initial,
  names,
  canDecide,
}: {
  projectId: string;
  requests: ApprovalRequest[];
  names: Record<string, string>;
  canDecide: boolean;
}) {
  const t = useTranslations("approvals");
  const tWork = useTranslations("work");
  const format = useFormatter();
  const [requests, setRequests] = useState(initial);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pendingCount = requests.filter((request) => effectiveStatus(request) === "pending").length;
  const shown = filter === "pending" ? requests.filter((request) => effectiveStatus(request) === "pending") : requests;
  const statusLabel = (status: string | undefined) =>
    !status ? "-" : BUILT_IN_STATUSES.has(status) ? tWork("status", { status }) : status;

  const decide = async (request: ApprovalRequest, approve: boolean) => {
    if (approve && request.action === "delete_task") {
      const ok = await confirmAction(t("confirmDelete", { title: request.snapshot.title ?? "" }), t("approveDelete"));
      if (!ok) return;
    }
    setBusy(request.id);
    setErrors((current) => ({ ...current, [request.id]: "" }));
    try {
      const result = await decideApproval(projectId, request.id, approve, comments[request.id] ?? "");
      if (result.request) {
        const updated = result.request;
        setRequests((current) => current.map((item) => (item.id === request.id ? { ...item, ...updated } : item)));
      }
      if (result.error) setErrors((current) => ({ ...current, [request.id]: result.error! }));
    } catch {
      setErrors((current) => ({ ...current, [request.id]: t("failed") }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("filter")} className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {(["pending", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-md px-3 py-1.5 ${filter === value ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            {value === "pending" ? t("filterPending", { count: pendingCount }) : t("filterAll")}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("nothingWaiting")}</p>}

      <ul className="space-y-3">
        {shown.map((request) => {
          const status = effectiveStatus(request);
          const requester = names[request.requested_by];
          const decider = request.decided_by ? names[request.decided_by] : null;
          const title = request.snapshot.title ?? t("untitled");
          return (
            <li key={request.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <Bot className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="font-medium text-foreground">{request.app_name ?? t("unknownApp")}</span>
                  {requester && <span>· {t("onBehalfOf", { person: requester })}</span>}
                  <span>· {format.dateTime(new Date(request.created_at), { dateStyle: "medium", timeStyle: "short" })}</span>
                </p>
                <Badge variant={STATUS_BADGE[status]}>{t(`status.${status}`)}</Badge>
              </div>

              <h2 className="mt-2 text-base font-semibold">
                {t(`action.${request.action}`)}:{" "}
                {request.task_id ? (
                  <Link href={`/projects/${projectId}/work?openTask=${request.task_id}`} className="underline-offset-2 hover:underline">
                    {title}
                  </Link>
                ) : (
                  <span>
                    {title} <span className="text-sm font-normal text-muted-foreground">({t("taskGone")})</span>
                  </span>
                )}
              </h2>

              <p className="mt-1 text-sm">
                {request.action === "complete_task" ? (
                  <>
                    <span className="text-muted-foreground">{t("statusChange")}: </span>
                    <del className="text-muted-foreground">{statusLabel(request.snapshot.status)}</del>
                    <span aria-hidden> → </span>
                    <span className="sr-only">{t("changesTo")}</span>
                    <ins className="no-underline font-medium">{statusLabel("done")}</ins>
                  </>
                ) : (
                  <span className={status === "pending" ? "text-destructive" : "text-muted-foreground"}>{t("deleteEffect")}</span>
                )}
              </p>

              {request.reason && (
                <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  <span className="sr-only">{t("reason")}: </span>
                  {request.reason}
                </blockquote>
              )}

              {status === "pending" ? (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("expires", { date: format.dateTime(new Date(request.expires_at), { dateStyle: "medium", timeStyle: "short" }) })}
                  </p>
                  {canDecide ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        aria-label={t("comment")}
                        placeholder={t("commentPlaceholder")}
                        maxLength={APPROVAL_TEXT_MAX}
                        rows={2}
                        value={comments[request.id] ?? ""}
                        onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={request.action === "delete_task" ? "destructive" : "default"}
                          disabled={busy !== null || !request.task_id}
                          onClick={() => void decide(request, true)}
                        >
                          {busy === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {request.action === "delete_task" ? t("approveDelete") : t("approveComplete")}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(request, false)}>
                          <X className="h-4 w-4" />
                          {t("reject")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{t("onlyManagers")}</p>
                  )}
                </>
              ) : (
                (decider || request.decision_comment) && (
                  <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {decider && request.decided_at &&
                      t("decidedBy", {
                        person: decider,
                        date: format.dateTime(new Date(request.decided_at), { dateStyle: "medium", timeStyle: "short" }),
                      })}
                    {request.decision_comment && <> - {request.decision_comment}</>}
                  </p>
                )
              )}

              {errors[request.id] && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {errors[request.id]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
