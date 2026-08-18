"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Link2, Plus } from "lucide-react";
import { CreateDecisionDialog } from "../decisions/create-decision-dialog";
import { DecisionCardMenu } from "../decisions/decision-card-menu";
import { STATUS_CONFIG as DECISION_STATUS_CONFIG, TYPE_COLORS as DECISION_TYPE_COLORS } from "../decisions/decision-config";
import { CreateSourceDialog } from "../knowledge/create-source-dialog";
import { SourceCardMenu } from "../knowledge/source-card-menu";
import { TYPE_LABELS as SOURCE_TYPE_LABELS } from "../knowledge/source-config";
import { CreateRelationDialog } from "./create-relation-dialog";
import { RelationRow } from "./relation-row";
import type { Decision, ContextRelation, ContextSource } from "@/types/context";

type TabType = "decisions" | "relations" | "sources";

export function ContextTabs({
  projectId,
  canWrite,
  canManage,
  decisions,
  relations,
  sources,
}: {
  projectId: string;
  canWrite: boolean;
  canManage: boolean;
  decisions: Decision[];
  relations: ContextRelation[];
  sources: ContextSource[];
}) {
  const [activeTab, setActiveTab] = useState<TabType>("decisions");

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "decisions", label: "Decisions", count: decisions.length },
    { key: "relations", label: "Relations", count: relations.length },
    { key: "sources", label: "Sources", count: sources.length },
  ];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Context Layer</h1>
        <p className="text-muted-foreground">Project knowledge, decisions, and relationships</p>
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === tab.key
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <Badge variant="secondary" className="ml-2">
              {tab.count}
            </Badge>
          </button>
        ))}
      </div>

      {activeTab === "decisions" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Decisions</h2>
            {canWrite && <CreateDecisionDialog projectId={projectId} />}
          </div>

          {decisions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No decisions yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Record important project decisions to preserve context
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
                const statusConfig = DECISION_STATUS_CONFIG[decision.status];
                const StatusIcon = statusConfig.icon;

                return (
                  <Card key={decision.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-lg">{decision.title}</CardTitle>
                            <Badge className={DECISION_TYPE_COLORS[decision.decision_type]}>
                              {decision.decision_type}
                            </Badge>
                            <Badge className={statusConfig.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>
                          {decision.description && <CardDescription>{decision.description}</CardDescription>}
                        </div>
                        {canWrite && (
                          <DecisionCardMenu projectId={projectId} decision={decision} canDelete={canManage} />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {decision.impact && (
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold mb-1">Impact</h4>
                          <p className="text-sm text-muted-foreground">{decision.impact}</p>
                        </div>
                      )}
                      {decision.alternatives && decision.alternatives.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Alternatives Considered</h4>
                          <p className="text-sm text-muted-foreground">{decision.alternatives.join(", ")}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "relations" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Relations</h2>
            {canWrite && <CreateRelationDialog projectId={projectId} />}
          </div>

          {relations.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No relations yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create relations to link project entities together
                </p>
                {canWrite && <CreateRelationDialog projectId={projectId} />}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {relations.map((relation) => (
                <RelationRow key={relation.id} projectId={projectId} relation={relation} canDelete={canManage} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "sources" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Sources</h2>
            {canWrite && <CreateSourceDialog projectId={projectId} />}
          </div>

          {sources.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No sources yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add knowledge sources to build project context
                </p>
                {canWrite && (
                  <CreateSourceDialog
                    projectId={projectId}
                    trigger={
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Source
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <Card key={source.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-lg">{source.title}</CardTitle>
                          <Badge variant="outline">{SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}</Badge>
                        </div>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            {source.url}
                          </a>
                        )}
                      </div>
                      {canWrite && <SourceCardMenu projectId={projectId} source={source} canDelete={canManage} />}
                    </div>
                  </CardHeader>
                  {source.content && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{source.content}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
