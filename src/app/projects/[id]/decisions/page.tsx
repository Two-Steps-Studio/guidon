import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Plus } from "lucide-react";
import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { CreateDecisionDialog } from "./create-decision-dialog";
import { DecisionCardMenu } from "./decision-card-menu";
import { STATUS_CONFIG, TYPE_COLORS } from "./decision-config";
import type { Decision } from "@/types/context";

export default async function ProjectDecisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const canWrite = canWriteProject(access.role);
  const canDelete = canManageProject(access.role);

  const supabase = await createClient();
  const { data } = await supabase
    .from("context_decisions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const decisions = (data ?? []) as Decision[];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Decisions</h1>
          <p className="text-muted-foreground">Track important project decisions and their rationale</p>
        </div>
        {canWrite && <CreateDecisionDialog projectId={projectId} />}
      </div>

      {decisions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No decisions yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Record important project decisions to preserve context and rationale
            </p>
            {canWrite && (
              <CreateDecisionDialog
                projectId={projectId}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Decision
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {decisions.map((decision) => {
            const statusConfig = STATUS_CONFIG[decision.status];
            const StatusIcon = statusConfig.icon;

            return (
              <Card key={decision.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{decision.title}</CardTitle>
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                        <Badge className={TYPE_COLORS[decision.decision_type]}>
                          {decision.decision_type}
                        </Badge>
                      </div>
                      {decision.description && <CardDescription>{decision.description}</CardDescription>}
                    </div>
                    {canWrite && (
                      <DecisionCardMenu projectId={projectId} decision={decision} canDelete={canDelete} />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {decision.impact && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Impact</h4>
                        <p className="text-sm text-muted-foreground">{decision.impact}</p>
                      </div>
                    )}
                    {decision.alternatives && decision.alternatives.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Alternatives Considered</h4>
                        {/* .join(', ') — the array previously rendered as raw
                            React children with no separator between entries. */}
                        <p className="text-sm text-muted-foreground">
                          {decision.alternatives.join(", ")}
                        </p>
                      </div>
                    )}
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
