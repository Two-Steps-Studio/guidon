"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Trash2 } from "lucide-react";
import { deleteRelation } from "./actions";
import type { ContextRelation } from "@/types/context";

export function RelationRow({
  projectId,
  relation,
  canDelete,
  sourceLabel,
  targetLabel,
}: {
  projectId: string;
  relation: ContextRelation;
  canDelete: boolean;
  /** Resolved display name for each side - undefined if the entity was
   * deleted, or is otherwise no longer resolvable (see entity-label.ts). */
  sourceLabel?: string;
  targetLabel?: string;
}) {
  const t = useTranslations("context");
  const tCommon = useTranslations("common");
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
          <Badge variant="outline">{tCommon("entityType", { type: relation.source_type })}</Badge>
          <span className="text-sm text-muted-foreground" title={relation.source_id}>
            {sourceLabel ?? `${relation.source_id.slice(0, 8)}...`}
          </span>
          <span className="text-sm font-medium">{tCommon("relationType", { type: relation.relation_type })}</span>
          <Badge variant="outline">{tCommon("entityType", { type: relation.target_type })}</Badge>
          <span className="text-sm text-muted-foreground" title={relation.target_id}>
            {targetLabel ?? `${relation.target_id.slice(0, 8)}...`}
          </span>
          {error && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </span>
          )}
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={t("deleteRelationAria")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
