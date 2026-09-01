import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import type { ContextEntityType } from "@/types/context";

/**
 * Table + label column for each entity type context_relations can point at.
 * Mirrors the per-type SELECTs already hand-written in agent-context.ts's
 * relatedEntity fan-out, generalized to work for an arbitrary set of ids
 * instead of that file's specific known id-sets.
 */
const ENTITY_TABLE: Record<ContextEntityType, { table: string; column: string }> = {
  project: { table: "projects", column: "name" },
  task: { table: "tasks", column: "title" },
  phase: { table: "roadmap_phases", column: "name" },
  decision: { table: "context_decisions", column: "title" },
  file: { table: "project_files", column: "name" },
  source: { table: "context_sources", column: "title" },
  // No title column - the content itself is the only identifying text.
  memory: { table: "project_memory", column: "content" },
};

export interface EntityRef {
  type: ContextEntityType;
  id: string;
}

/**
 * `type:id` -> a short display label (a title/name column, or the first
 * 60 chars of content for memory entries), for entities that resolved -
 * a ref pointing at something deleted or RLS-hidden just isn't in the map;
 * callers fall back to the raw id (see RelationRow's use of this).
 */
export async function resolveEntityLabels(userId: string, refs: EntityRef[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (refs.length === 0) return labels;

  const idsByType = new Map<ContextEntityType, Set<string>>();
  for (const ref of refs) {
    if (!idsByType.has(ref.type)) idsByType.set(ref.type, new Set());
    idsByType.get(ref.type)!.add(ref.id);
  }

  const directDb = hasDirectDatabase();
  const supabase = directDb ? null : await createClient();

  await Promise.all(
    Array.from(idsByType.entries()).map(async ([type, idSet]) => {
      const { table, column } = ENTITY_TABLE[type];
      const ids = Array.from(idSet);

      if (directDb) {
        // table/column are interpolated (Postgres can't bind identifiers as
        // parameters), but both come exclusively from the ENTITY_TABLE
        // constant above, keyed by the closed ContextEntityType union -
        // never from anything a caller passes through as free text. `ids`
        // is the only actual user-influenced value here, and it's a real
        // bind parameter.
        const result = await withUser(userId, ({ query }) =>
          query(`SELECT id, ${column} AS label FROM ${table} WHERE id = ANY($1::uuid[])`, [ids])
        );
        for (const row of result.rows as { id: string; label: string }[]) {
          labels.set(`${type}:${row.id}`, truncate(row.label, type));
        }
        return;
      }

      // Supabase-js's .select() has a template-literal type parser that
      // can't validate a dynamic column name - "id, " + column (not a
      // template literal) sidesteps it; the actual query is identical.
      const { data } = await supabase!.from(table).select("id, " + column).in("id", ids);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) {
        labels.set(`${type}:${row.id}`, truncate(row[column], type));
      }
    })
  );

  return labels;
}

function truncate(label: string, type: ContextEntityType): string {
  if (type !== "memory") return label;
  return label.length > 60 ? `${label.slice(0, 60)}...` : label;
}
