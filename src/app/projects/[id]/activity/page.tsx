import { getTranslations } from "next-intl/server";
import { displayName } from "@/lib/people";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity as ActivityIcon } from "lucide-react";
import { requireProjectAccess } from "@/lib/data/project-access";
import { getRecentActivity } from "@/lib/data/activity";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { configFor } from "./action-config";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { showAi } from "@/lib/data/ai-preference";
import { AgentMonitoringReport } from "@/components/work/agent-monitoring-report";

interface ActorProfile {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Activity log for a project.
 *
 * RLS mirror: activity_logs_select (001_initial_schema.sql) grants SELECT
 * when `project_id IS NOT NULL AND private.project_access(project_id)` -
 * i.e. the same visibility check every other project page already passes
 * through requireProjectAccess(). No extra role gate is needed here: unlike
 * write actions, viewing the log follows plain project visibility.
 */
export default async function ProjectActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id: projectId } = await params;
  const t = await getTranslations("activity");

  // getRecentActivity() doesn't depend on the access check's result, and
  // each call opens its own connection (getRecentActivity's own withUser()
  // call), so these run concurrently rather than one after another.
  const [access, entries] = await Promise.all([
    requireProjectAccess(projectId),
    getRecentActivity(projectId),
  ]);
  const monitoringVisible = await showAi(access.userId,access.project.ai_enabled);
  const monitoring = monitoringVisible && (await searchParams).view === "agents";
  const tMonitor = await getTranslations("agentMonitoring");

  // user_id references profiles(id) ON DELETE SET NULL (000_baseline_schema.sql)
  // - resolved separately, same pattern as memory/page.tsx's verified_by lookup.
  const userIds = Array.from(
    new Set(entries.map((entry) => entry.user_id).filter((id): id is string => !!id))
  );

  let profilesData: ActorProfile[];

  if (userIds.length === 0) {
    profilesData = [];
  } else if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("SELECT id, full_name, email FROM profiles WHERE id = ANY($1::uuid[])", [userIds])
    );
    profilesData = result.rows;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
    profilesData = (data ?? []) as ActorProfile[];
  }

  const profilesById = new Map(profilesData.map((p) => [p.id, p]));

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        {monitoringVisible && <nav aria-label={t("title")} className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant={monitoring?"outline":"default"}><Link href={`/projects/${projectId}/activity`} aria-current={!monitoring?"page":undefined}>{t("title")}</Link></Button>
          <Button asChild variant={monitoring?"default":"outline"}><Link href={`/projects/${projectId}/activity?view=agents`} aria-current={monitoring?"page":undefined}>{tMonitor("title")}</Link></Button>
        </nav>}
      </div>

      {monitoring ? <AgentMonitoringReport userId={access.userId} projectId={projectId} /> : entries.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const config = configFor(entry.action);
                const Icon = config.icon;
                const actor = entry.user_id ? profilesById.get(entry.user_id) : undefined;
                const actionLabel = t("action", { action: entry.action });

                return (
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                    <Icon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`}
                      style={access.project.color ? { color: access.project.color } : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{entry.actor_label || displayName(actor, t("someone"))}</span>{" "}
                        <span className="text-muted-foreground">{actionLabel.toLowerCase()}</span>
                        {entry.entity_type && (
                          <span className="text-muted-foreground"> · {entry.entity_type}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                      {entry.action === "module_builder_attempt" && <p className="break-all text-xs text-muted-foreground">{t("moduleBuilderLog", {
                        stage: entry.details?.stage === "compile" ? "compile" : "plan",
                        outcome: typeof entry.details?.outcome === "string" && /^[a-zA-Z]{1,32}$/.test(entry.details.outcome) ? entry.details.outcome : "unknown",
                        requestId: typeof entry.details?.requestId === "string" && /^[a-f0-9-]{36}$/.test(entry.details.requestId) ? entry.details.requestId : "-",
                      })}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
