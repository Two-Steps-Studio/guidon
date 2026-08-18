import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, TrendingUp } from "lucide-react";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { CreatePhaseDialog } from "./create-phase-dialog";
import { PhaseCardMenu } from "./phase-card-menu";
import { STATUS_CONFIG } from "./phase-status-config";
import type { RoadmapPhase } from "@/types/task";

export default async function ProjectRoadmapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const canManage = canManageProject(access.role);

  const supabase = await createClient();
  const { data } = await supabase
    .from("roadmap_phases")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true, nullsFirst: false });

  const phases = (data ?? []) as RoadmapPhase[];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Roadmap</h1>
          <p className="text-muted-foreground">Project phases and timeline</p>
        </div>
        {canManage && <CreatePhaseDialog projectId={projectId} />}
      </div>

      {phases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No roadmap phases yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first phase to start planning your project timeline
            </p>
            {canManage && (
              <CreatePhaseDialog
                projectId={projectId}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Phase
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {phases.map((phase) => {
            const config = STATUS_CONFIG[phase.status];
            const Icon = config.icon;

            return (
              <Card key={phase.id} className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                <div className="absolute left-4 top-6 w-4 h-4 rounded-full bg-primary border-4 border-background z-10" />

                <CardHeader className="pl-12">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{phase.name}</CardTitle>
                        <Badge className={config.color}>
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      {phase.description && <CardDescription>{phase.description}</CardDescription>}
                    </div>
                    {canManage && <PhaseCardMenu projectId={projectId} phase={phase} />}
                  </div>
                </CardHeader>
                <CardContent className="pl-12">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Start:</span>
                      <span>
                        {phase.start_date ? new Date(phase.start_date).toLocaleDateString() : "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">End:</span>
                      <span>
                        {phase.planned_end_date
                          ? new Date(phase.planned_end_date).toLocaleDateString()
                          : "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Progress:</span>
                      <span>{phase.completion_percentage}%</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${phase.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
