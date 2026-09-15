import { Activity as ActivityIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listRecentActivityForAdmin } from "@/lib/data/admin";
import { createServiceClient } from "@/lib/supabase-server";
import { configFor } from "@/app/projects/[id]/activity/action-config";

interface ActorProfile {
  id: string;
  full_name: string | null;
  email: string;
}

function nameFor(profile: ActorProfile | undefined, fallback: string): string {
  if (!profile) return fallback;
  return profile.full_name || profile.email;
}

/**
 * Instance-wide activity log (TODO.md §25) - the same activity_logs table
 * src/app/projects/[id]/activity/page.tsx reads, without the project filter,
 * via createServiceClient() since this deliberately spans every tenant.
 *
 * logActivity() (src/lib/data/log-activity.ts) is called from 14+ Server
 * Action files across the app, so this is populated in normal use - the
 * empty state below is only for a genuinely quiet instance, matching the
 * per-project page's own empty-state pattern.
 */
export default async function AdminLogsPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");
  const tActivity = await getTranslations("activity");

  const entries = await listRecentActivityForAdmin(100);

  // user_id references profiles(id) ON DELETE SET NULL - resolved
  // separately, same pattern as the per-project activity page.
  const supabase = createServiceClient();
  const userIds = Array.from(
    new Set(entries.map((entry) => entry.user_id).filter((id): id is string => !!id))
  );
  const { data: profilesData } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as ActorProfile[] };
  const profilesById = new Map(((profilesData ?? []) as ActorProfile[]).map((p) => [p.id, p]));

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("logsTitle")}</h2>
        <p className="text-muted-foreground">
          {t("logsSubtitle")}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title={t("noActivityYet")}
          description={t("noActivityDescription")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const config = configFor(entry.action);
                const Icon = config.icon;
                const actor = entry.user_id ? profilesById.get(entry.user_id) : undefined;
                const actionLabel = tActivity("action", { action: entry.action });
                const scope = entry.project_id
                  ? t("scopeProject", { id: entry.project_id.slice(0, 8) })
                  : entry.organization_id
                    ? t("scopeOrganization", { id: entry.organization_id.slice(0, 8) })
                    : t("scopeInstance");

                return (
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{nameFor(actor, t("someone"))}</span>{" "}
                        <span className="text-muted-foreground">{actionLabel.toLowerCase()}</span>
                        {entry.entity_type && <span className="text-muted-foreground"> · {entry.entity_type}</span>}
                        <span className="text-muted-foreground"> · {scope}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
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
