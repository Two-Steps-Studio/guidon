import { Activity as ActivityIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listRecentActivityForAdmin } from "@/lib/data/admin";
import { createServiceClient } from "@/lib/supabase-server";
import { configFor } from "@/app/projects/[id]/activity/action-config";

interface ActorProfile {
  id: string;
  full_name: string | null;
  email: string;
}

function nameFor(profile: ActorProfile | undefined): string {
  if (!profile) return "Someone";
  return profile.full_name || profile.email;
}

/**
 * Instance-wide activity log (TODO.md §25) — the same activity_logs table
 * src/app/projects/[id]/activity/page.tsx reads, without the project filter,
 * via createServiceClient() since this deliberately spans every tenant.
 *
 * Confirmed by the agent that built the per-project version: nothing in this
 * codebase currently writes to activity_logs (see src/lib/data/activity.ts),
 * so this renders correctly empty until a future feature starts logging
 * here. That's expected, not a bug — the empty state below matches the
 * per-project page's own empty-state pattern.
 */
export default async function AdminLogsPage() {
  await requireAdminAccess();

  const entries = await listRecentActivityForAdmin(100);

  // user_id references profiles(id) ON DELETE SET NULL — resolved
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
        <h2 className="text-2xl font-bold">Logs</h2>
        <p className="text-muted-foreground">
          Instance-wide activity, most recent first, across every organization and project.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ActivityIcon className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No activity yet</h3>
            <p className="max-w-md text-center text-muted-foreground">
              Nothing in Guidon currently writes to activity_logs, so this stays empty until a future feature
              starts logging here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const config = configFor(entry.action);
                const Icon = config.icon;
                const actor = entry.user_id ? profilesById.get(entry.user_id) : undefined;
                const scope = entry.project_id
                  ? `project ${entry.project_id.slice(0, 8)}`
                  : entry.organization_id
                    ? `organization ${entry.organization_id.slice(0, 8)}`
                    : "instance";

                return (
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{nameFor(actor)}</span>{" "}
                        <span className="text-muted-foreground">{config.label.toLowerCase()}</span>
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
