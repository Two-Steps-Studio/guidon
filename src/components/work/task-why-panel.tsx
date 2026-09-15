"use client";

/**
 * "Why" panel for TaskDetailDialog - surfaces the task's linked decision plus
 * everything connected through context_relations, grouped by relation type.
 * Data comes from getTaskWhyContext (src/lib/context/task-why.ts), fetched
 * lazily by the parent when the dialog opens.
 *
 * The empty state ("No context linked yet") is intentional, not a fallback to
 * avoid writing - TODO.md §20 is about making absence of context visible too,
 * and it nudges toward "Mark as decision" on a comment (also in
 * TaskDetailDialog) as the way to close that gap.
 */

import { HelpCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG as DECISION_STATUS_CONFIG } from "@/app/projects/[id]/decisions/decision-config";
import type { TaskCardMember } from "@/components/work/task-card";
import type { TaskWhyContext, TaskWhyRelatedItem } from "@/lib/context/task-why";
import type { DecisionStatus } from "@/types/context";

function AttributionLine({
  item,
  membersById,
}: {
  item: TaskWhyRelatedItem;
  membersById: Map<string, TaskCardMember>;
}) {
  const t = useTranslations("work");
  const who = item.createdByText
    ? item.createdByText
    : item.createdBy
      ? membersById.get(item.createdBy)?.full_name || membersById.get(item.createdBy)?.email || t("unknownAuthor")
      : t("unknownAuthor");

  return (
    <p className="text-xs text-muted-foreground">
      {who}
      {item.createdAt && <>{" · "}{new Date(item.createdAt).toLocaleDateString()}</>}
    </p>
  );
}

function RelatedItemRow({
  item,
  membersById,
}: {
  item: TaskWhyRelatedItem;
  membersById: Map<string, TaskCardMember>;
}) {
  const tCommon = useTranslations("common");
  return (
    <li className="rounded-md border border-border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {tCommon("entityType", { type: item.entityType })}
            </Badge>
            {item.status && (
              <Badge className={DECISION_STATUS_CONFIG[item.status as DecisionStatus]?.color}>
                {tCommon("decisionStatus", { status: item.status })}
              </Badge>
            )}
          </div>
          <p className={item.missing ? "mt-1 text-sm italic text-muted-foreground" : "mt-1 text-sm font-medium text-foreground"}>
            {item.title}
          </p>
          {item.preview && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.preview}</p>
          )}
        </div>
      </div>
      <div className="mt-1.5">
        <AttributionLine item={item} membersById={membersById} />
      </div>
    </li>
  );
}

export function TaskWhyPanel({
  why,
  loading,
  error,
  members,
}: {
  why: TaskWhyContext | null;
  loading: boolean;
  error: string | null;
  members: TaskCardMember[];
}) {
  const t = useTranslations("work");
  const tCommon = useTranslations("common");
  const membersById = new Map(members.map((member) => [member.id, member]));

  const decision = why?.decision ?? null;

  const grouped = new Map<string, TaskWhyRelatedItem[]>();
  for (const item of why?.related ?? []) {
    const list = grouped.get(item.relationType) ?? [];
    list.push(item);
    grouped.set(item.relationType, list);
  }

  const hasAnyContext = Boolean(decision) || (why?.related.length ?? 0) > 0;

  return (
    <section aria-label={t("whyHeading")} className="space-y-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
        {t("whyHeading")}
      </h3>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("loadingContext")}
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !hasAnyContext ? (
        <p className="text-sm text-muted-foreground">{t("noContextLinked")}</p>
      ) : (
        <div className="space-y-3">
          {decision && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{t("decisionBadge")}</Badge>
                <Badge className={DECISION_STATUS_CONFIG[decision.status as DecisionStatus]?.color}>
                  {tCommon("decisionStatus", { status: decision.status })}
                </Badge>
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{decision.title}</p>
              {decision.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{decision.description}</p>
              )}
            </div>
          )}

          {[...grouped.entries()].map(([relationType, items]) => (
            <div key={relationType}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tCommon("relationType", { type: relationType })}
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <RelatedItemRow key={item.relationId} item={item} membersById={membersById} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
