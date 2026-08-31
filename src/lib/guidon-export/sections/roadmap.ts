import "server-only";

import { z } from "zod";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import type { GuidonSection } from "../types";

const PhaseStatusEnum = z.enum(["planned", "in_progress", "completed", "blocked"]);

const PhaseSchema = z.object({
  localId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: PhaseStatusEnum,
  completionPercentage: z.number().int().min(0).max(100).nullable().optional(),
  startDate: z.string().nullable().optional(),
  plannedEndDate: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  taskLocalIds: z.array(z.string()).optional(),
});

const RoadmapSchema = z.object({
  phases: z.array(PhaseSchema).default([]),
});

export type RoadmapData = z.infer<typeof RoadmapSchema>;

interface PhaseRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  completion_percentage: number | null;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  sort_order: number | null;
}

/**
 * Task<->phase links have no dedicated column anywhere (confirmed against
 * the real schema) - the only place they can live is the generic
 * polymorphic `context_relations` table. This is the first thing in Guidon
 * that actually populates that link (`relation_type: 'part_of'`,
 * task -> phase), so exporting an existing project's roadmap today will
 * always come back with empty `taskLocalIds` unless it was itself created
 * by a previous `.guidon` import.
 */
const TASK_PHASE_RELATION = "part_of";

export const roadmapSection: GuidonSection<RoadmapData> = {
  key: "roadmap",
  schema: RoadmapSchema,

  async exportData(projectId, userId) {
    if (hasDirectDatabase()) {
      const phasesResult = await withUser(userId, ({ query }) =>
        query(
          `SELECT id, name, description, status, completion_percentage, start_date, planned_end_date,
                  actual_end_date, sort_order
           FROM roadmap_phases WHERE project_id = $1`,
          [projectId]
        )
      );
      const phases = phasesResult.rows as PhaseRow[];
      if (phases.length === 0) return { phases: [] };

      const relationsResult = await withUser(userId, ({ query }) =>
        query(
          `SELECT source_id AS task_id, target_id AS phase_id
           FROM context_relations
           WHERE relation_type = $1 AND source_type = 'task' AND target_type = 'phase'
             AND target_id = ANY($2::uuid[])`,
          [TASK_PHASE_RELATION, phases.map((p) => p.id)]
        )
      );
      return { phases: buildPhaseExport(phases, relationsResult.rows) };
    }

    const supabase = await createClient();
    const { data: phaseRows } = await supabase
      .from("roadmap_phases")
      .select("id, name, description, status, completion_percentage, start_date, planned_end_date, actual_end_date, sort_order")
      .eq("project_id", projectId);

    const phases = (phaseRows ?? []) as PhaseRow[];
    if (phases.length === 0) return { phases: [] };

    const { data: relationRows } = await supabase
      .from("context_relations")
      .select("source_id, target_id")
      .eq("relation_type", TASK_PHASE_RELATION)
      .eq("source_type", "task")
      .eq("target_type", "phase")
      .in("target_id", phases.map((p) => p.id));

    return {
      phases: buildPhaseExport(
        phases,
        (relationRows ?? []).map((r) => ({ task_id: r.source_id, phase_id: r.target_id }))
      ),
    };
  },

  async importData(projectId, userId, data, idMap) {
    if (hasDirectDatabase()) {
      await withUser(userId, async ({ query }) => {
        // Deleting phases cascades cleanup of their context_relations rows
        // via the AFTER DELETE trigger (migration 012) - no manual step needed.
        await query("DELETE FROM roadmap_phases WHERE project_id = $1", [projectId]);

        for (const phase of data.phases) {
          const result = await query(
            `INSERT INTO roadmap_phases
               (project_id, name, description, status, completion_percentage, start_date,
                planned_end_date, actual_end_date, sort_order, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
              projectId,
              phase.name,
              phase.description ?? null,
              phase.status,
              phase.completionPercentage ?? 0,
              phase.startDate ?? null,
              phase.plannedEndDate ?? null,
              phase.actualEndDate ?? null,
              phase.sortOrder ?? null,
              userId,
            ]
          );
          const newPhaseId = result.rows[0].id as string;
          idMap.register(phase.localId, newPhaseId);

          for (const taskLocalId of phase.taskLocalIds ?? []) {
            const newTaskId = idMap.resolve(taskLocalId);
            if (!newTaskId) continue; // pre-import validation should prevent this
            await query(
              `INSERT INTO context_relations (source_type, source_id, target_type, target_id, relation_type, created_by)
               VALUES ('task', $1, 'phase', $2, $3, $4)`,
              [newTaskId, newPhaseId, TASK_PHASE_RELATION, userId]
            );
          }
        }
      });
      return;
    }

    // See the matching comment in task-board.ts's importData: Supabase has
    // no client-side transaction here, so old phases are only removed once
    // every new one has landed successfully - never delete-then-maybe-fail.
    const supabase = await createClient();

    const { data: oldPhases, error: oldPhasesError } = await supabase
      .from("roadmap_phases")
      .select("id")
      .eq("project_id", projectId);
    if (oldPhasesError) throw new Error(`Failed to read existing roadmap phases: ${oldPhasesError.message}`);

    for (const phase of data.phases) {
      const { data: created, error } = await supabase
        .from("roadmap_phases")
        .insert({
          project_id: projectId,
          name: phase.name,
          description: phase.description ?? null,
          status: phase.status,
          completion_percentage: phase.completionPercentage ?? 0,
          start_date: phase.startDate ?? null,
          planned_end_date: phase.plannedEndDate ?? null,
          actual_end_date: phase.actualEndDate ?? null,
          sort_order: phase.sortOrder ?? null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to import phase "${phase.name}": ${error.message}`);

      const newPhaseId = created.id as string;
      idMap.register(phase.localId, newPhaseId);

      const relationRows = (phase.taskLocalIds ?? [])
        .map((taskLocalId) => idMap.resolve(taskLocalId))
        .filter((newTaskId): newTaskId is string => Boolean(newTaskId))
        .map((newTaskId) => ({
          source_type: "task",
          source_id: newTaskId,
          target_type: "phase",
          target_id: newPhaseId,
          relation_type: TASK_PHASE_RELATION,
          created_by: userId,
        }));

      if (relationRows.length > 0) {
        const { error: relError } = await supabase.from("context_relations").insert(relationRows);
        if (relError) throw new Error(`Failed to link tasks to phase "${phase.name}": ${relError.message}`);
      }
    }

    // Cascades cleanup of the old phases' context_relations rows via the
    // AFTER DELETE trigger (migration 012) - no manual step needed, same
    // as the direct-Postgres branch above.
    if (oldPhases && oldPhases.length > 0) {
      const { error } = await supabase
        .from("roadmap_phases")
        .delete()
        .in("id", oldPhases.map((p) => p.id));
      if (error) throw new Error(`Failed to remove replaced roadmap phases: ${error.message}`);
    }
  },
};

function buildPhaseExport(
  phases: PhaseRow[],
  relations: Array<{ task_id: string; phase_id: string }>
): RoadmapData["phases"] {
  const taskIdsByPhase = new Map<string, string[]>();
  for (const relation of relations) {
    const list = taskIdsByPhase.get(relation.phase_id) ?? [];
    list.push(relation.task_id);
    taskIdsByPhase.set(relation.phase_id, list);
  }

  return phases.map((row) => ({
    localId: row.id,
    name: row.name,
    description: row.description,
    status: row.status as z.infer<typeof PhaseStatusEnum>,
    completionPercentage: row.completion_percentage,
    startDate: row.start_date,
    plannedEndDate: row.planned_end_date,
    actualEndDate: row.actual_end_date,
    sortOrder: row.sort_order,
    taskLocalIds: taskIdsByPhase.get(row.id) ?? [],
  }));
}
