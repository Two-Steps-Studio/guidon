import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus } from "lucide-react";
import { requireProjectAccess, canWriteProject } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { CreateMemoryDialog } from "./create-memory-dialog";
import { MemoryCardMenu } from "./memory-card-menu";
import { MEMORY_TYPE_CONFIG } from "./memory-type-config";
import type { ProjectMemory } from "@/types/context";

export default async function ProjectMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const canWrite = canWriteProject(access.role);

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_memory")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const memories = (data ?? []) as ProjectMemory[];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Memory</h1>
          <p className="text-muted-foreground">Persistent project knowledge and insights</p>
        </div>
        {canWrite && <CreateMemoryDialog projectId={projectId} />}
      </div>

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
        <div className="space-y-4">
          {memories.map((memory) => {
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
