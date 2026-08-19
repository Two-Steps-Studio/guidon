import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus } from "lucide-react";
import { requireProjectAccess, canWriteProject } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { activeAIProviderName } from "@/lib/ai/provider";
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

function nameFor(profile: MemoryProfile | undefined): string {
  if (!profile) return "Unknown";
  return profile.full_name || profile.email;
}

export default async function ProjectMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const canWrite = canWriteProject(access.role);

  let memories: ProjectMemory[];

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("SELECT * FROM project_memory WHERE project_id = $1 ORDER BY created_at DESC", [
        projectId,
      ])
    );
    memories = result.rows;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_memory")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    memories = (data ?? []) as ProjectMemory[];
  }

  // A pending insight is unverified AI output — TODO.md §20 is explicit that
  // this must not blend in with trusted project truth, so it gets a
  // distinct section and a review flow (Accept/Correct/Reject) instead of
  // the normal Edit/Delete menu. Everything else (including already-accepted
  // insights, now memory_type 'fact') renders through the regular list.
  const pending = memories.filter((memory) => memory.memory_type === "ai_insight" && !memory.verified);
  const rest = memories.filter((memory) => !(memory.memory_type === "ai_insight" && !memory.verified));

  // verified_by and created_by both reference profiles(id) (001) — fetched
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
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);
    profilesData = (data ?? []) as MemoryProfile[];
  }

  const profilesById = new Map(profilesData.map((p) => [p.id, p]));
  const canGenerateInsight = canWrite && activeAIProviderName() !== null;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Memory</h1>
          <p className="text-muted-foreground">Persistent project knowledge and insights</p>
        </div>
        <div className="flex items-start gap-2">
          {canGenerateInsight && <GenerateInsightButton projectId={projectId} />}
          {canWrite && <CreateMemoryDialog projectId={projectId} />}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mb-8 space-y-4">
          <h2 className="text-xl font-semibold">Pending Review ({pending.length})</h2>
          {pending.map((memory) => (
            <InsightReviewCard key={memory.id} projectId={projectId} memory={memory} />
          ))}
        </div>
      )}

      {memories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No memories yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Start capturing project knowledge and insights
            </p>
            {canWrite && (
              <CreateMemoryDialog
                projectId={projectId}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Memory
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
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
                          <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                          {memory.verified && <Badge variant="outline">Verified</Badge>}
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
                      Created {new Date(memory.created_at).toLocaleDateString()}
                    </p>
                    {memory.verified && memory.verified_by && memory.verified_at && (
                      <p className="text-xs text-muted-foreground">
                        Verified by {nameFor(profilesById.get(memory.verified_by))},{" "}
                        {new Date(memory.verified_at).toLocaleDateString()}
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
