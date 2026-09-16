import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Brain, Plus } from "lucide-react";
import { requireProjectAccess, canWriteProject } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isAIAvailableForOrg } from "@/lib/ai/resolve-provider";
import { CreateMemoryDialog } from "./create-memory-dialog";
import { GenerateInsightButton } from "./generate-insight-button";
import { InsightReviewCard } from "./insight-review-card";
import { MemoryCardMenu } from "./memory-card-menu";
import { MEMORY_TYPE_CONFIG } from "./memory-type-config";
import type { ProjectMemory } from "@/types/context";

interface MemoryProfile {
  id: string;
  full_name: string | null;
  email: string;
}

function nameFor(profile: MemoryProfile | undefined, unknownLabel: string): string {
  if (!profile) return unknownLabel;
  return profile.full_name || profile.email;
}

export default async function ProjectMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const t = await getTranslations("memory");
  const tCommon = await getTranslations("common");
  const access = await requireProjectAccess(projectId);
  const canWrite = canWriteProject(access.role);

  // Only depends on `access` (already resolved), not on the memories/profiles
  // queries below - started here so it runs alongside them instead of as a
  // third sequential round-trip tacked onto the end of the page. Skipped
  // entirely when !canWrite, same short-circuit the original inline
  // `canWrite && await isAIAvailableForOrg(...)` had.
  const aiAvailablePromise = canWrite
    ? isAIAvailableForOrg(access.project.organization_id, access.userId)
    : null;

  let memories: ProjectMemory[];

  // Safety cap, not pagination - see src/app/projects/[id]/work/page.tsx
  // for the same reasoning applied to tasks.
  const LIST_LIMIT = 500;

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query(
        "SELECT * FROM project_memory WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
        [projectId, LIST_LIMIT]
      )
    );
    memories = result.rows;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_memory")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw new Error(`Failed to load memory: ${error.message}`);

    memories = (data ?? []) as ProjectMemory[];
  }

  // A pending insight is unverified AI output - TODO.md §20 is explicit that
  // this must not blend in with trusted project truth, so it gets a
  // distinct section and a review flow (Accept/Correct/Reject) instead of
  // the normal Edit/Delete menu. Everything else (including already-accepted
  // insights, now memory_type 'fact') renders through the regular list.
  const pending = memories.filter((memory) => memory.memory_type === "ai_insight" && !memory.verified);
  const rest = memories.filter((memory) => !(memory.memory_type === "ai_insight" && !memory.verified));

  // verified_by and created_by both reference profiles(id) (001) - fetched
  // separately rather than embedded, since PostgREST needs an explicit FK
  // hint to embed two relations to the same table and there is no existing
  // precedent for that in this codebase; a plain id lookup avoids it.
  const profileIds = Array.from(
    new Set(memories.map((memory) => memory.verified_by).filter((id): id is string => !!id))
  );

  let profilesData: MemoryProfile[];

  if (profileIds.length === 0) {
    profilesData = [];
  } else if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("SELECT id, full_name, email FROM profiles WHERE id = ANY($1::uuid[])", [profileIds])
    );
    profilesData = result.rows;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);
    if (error) throw new Error(`Failed to load profiles: ${error.message}`);
    profilesData = (data ?? []) as MemoryProfile[];
  }

  const profilesById = new Map(profilesData.map((p) => [p.id, p]));
  const canGenerateInsight = aiAvailablePromise !== null && (await aiAvailablePromise);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-start gap-2">
          {canGenerateInsight && <GenerateInsightButton projectId={projectId} />}
          {canWrite && <CreateMemoryDialog projectId={projectId} />}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mb-8 space-y-4">
          <h2 className="text-xl font-semibold">{t("pendingReview", { count: pending.length })}</h2>
          {pending.map((memory) => (
            <InsightReviewCard key={memory.id} projectId={projectId} memory={memory} />
          ))}
        </div>
      )}

      {memories.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            canWrite ? (
              <CreateMemoryDialog
                projectId={projectId}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("createMemory")}
                  </Button>
                }
              />
            ) : undefined
          }
        />
      ) : (
        rest.length > 0 && (
          <div className="space-y-4">
            {rest.map((memory) => {
              const typeConfig = MEMORY_TYPE_CONFIG[memory.memory_type];
              const TypeIcon = typeConfig.icon;

              return (
                <Card key={memory.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <TypeIcon className="h-5 w-5 text-muted-foreground" />
                          <Badge className={typeConfig.color}>{tCommon("memoryType", { type: memory.memory_type })}</Badge>
                          {memory.verified && <Badge variant="outline">{t("verified")}</Badge>}
                        </div>
                        <CardDescription className="text-base whitespace-pre-wrap">
                          {memory.content}
                        </CardDescription>
                      </div>
                      {canWrite && (
                        <MemoryCardMenu
                          projectId={projectId}
                          memoryId={memory.id}
                          content={memory.content}
                          memoryType={memory.memory_type}
                        />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {t("createdOn", { date: new Date(memory.created_at).toLocaleDateString() })}
                    </p>
                    {memory.verified && memory.verified_by && memory.verified_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("verifiedBy", {
                          name: nameFor(profilesById.get(memory.verified_by), t("unknown")),
                          date: new Date(memory.verified_at).toLocaleDateString(),
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
