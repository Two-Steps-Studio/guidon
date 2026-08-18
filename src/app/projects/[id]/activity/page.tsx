import { Card, CardContent } from "@/components/ui/card";
import { Activity as ActivityIcon } from "lucide-react";
import { requireProjectAccess } from "@/lib/data/project-access";
import { getRecentActivity } from "@/lib/data/activity";
import { createClient } from "@/lib/supabase-server";
import { configFor } from "./action-config";

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
 * Activity log for a project.
 *
 * RLS mirror: activity_logs_select (001_initial_schema.sql) grants SELECT
 * when `project_id IS NOT NULL AND private.project_access(project_id)` —
 * i.e. the same visibility check every other project page already passes
 * through requireProjectAccess(). No extra role gate is needed here: unlike
 * write actions, viewing the log follows plain project visibility.
 */
export default async function ProjectActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  await requireProjectAccess(projectId);

  const entries = await getRecentActivity(projectId);

  // user_id references profiles(id) ON DELETE SET NULL (000_baseline_schema.sql)
  // — resolved separately, same pattern as memory/page.tsx's verified_by lookup.
  const supabase = await createClient();
  const userIds = Array.from(
    new Set(entries.map((entry) => entry.user_id).filter((id): id is string => !!id))
  );
  const { data: profilesData } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as ActorProfile[] };
  const profilesById = new Map(((profilesData ?? []) as ActorProfile[]).map((p) => [p.id, p]));

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Activity</h1>
        <p className="text-muted-foreground">Recent changes on this project</p>
      </div>

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ActivityIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Changes on this project will show up here once they happen.
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

                return (
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{nameFor(actor)}</span>{" "}
                        <span className="text-muted-foreground">{config.label.toLowerCase()}</span>
                        {entry.entity_type && (
                          <span className="text-muted-foreground"> · {entry.entity_type}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
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
