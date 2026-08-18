"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Trash2 } from "lucide-react";
import { deleteRelation } from "./actions";
import { ENTITY_TYPE_LABELS, RELATION_TYPE_LABELS } from "./relation-config";
import type { ContextRelation } from "@/types/context";

export function RelationRow({
  projectId,
  relation,
  canDelete,
}: {
  projectId: string;
  relation: ContextRelation;
  canDelete: boolean;
}) {
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteRelation(projectId, relation.id);
      setError(result.error);
    });
  };

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="outline">{ENTITY_TYPE_LABELS[relation.source_type]}</Badge>
          <span className="text-sm text-muted-foreground">{relation.source_id.slice(0, 8)}...</span>
          <span className="text-sm font-medium">{RELATION_TYPE_LABELS[relation.relation_type]}</span>
          <Badge variant="outline">{ENTITY_TYPE_LABELS[relation.target_type]}</Badge>
          <span className="text-sm text-muted-foreground">{relation.target_id.slice(0, 8)}...</span>
          {error && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </span>
          )}
        </div>
        {canDelete && (
          <Button variant="ghost" size="icon" className="text-destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
