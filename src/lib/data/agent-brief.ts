import "server-only";

import { dataClient, type DataClient } from "@/lib/data-client";
import type { BriefInput } from "@/lib/context/agent-brief-core";

export type AgentBriefVersion = { id: string; version: number; content: string; approved_by: string | null; approved_at: string };
const VERSION_COLUMNS = "id, version, content, approved_by, approved_at";

/** What the brief is generated from, read under RLS as `userId`. */
export async function loadBriefInput(db: DataClient, projectId: string): Promise<BriefInput | null> {
  const [project, technologies, memory, decisions, permissions] = await Promise.all([
    db.from<{ id: string; name: string; description: string | null; ai_enabled: boolean; allow_ai_auto_complete: boolean }>("projects")
      .select("id, name, description, ai_enabled, allow_ai_auto_complete").eq("id", projectId).maybeSingle(),
    db.from<BriefInput["technologies"][number]>("technologies").select("id, name, version, category").eq("project_id", projectId).order("sort_order", { ascending: true }).limit(100),
    db.from<BriefInput["memory"][number]>("project_memory").select("id, content, memory_type, verified").eq("project_id", projectId).in("memory_type", ["project_rule", "preference", "constraint", "fact"]).order("created_at", { ascending: true }).limit(200),
    db.from<BriefInput["decisions"][number]>("context_decisions").select("id, title, status").eq("project_id", projectId).eq("status", "approved").order("created_at", { ascending: true }).limit(100),
    db.from<Record<string, boolean>>("project_ai_permissions").select("can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project.data) return null;
  return {
    project: { id: project.data.id, name: project.data.name, description: project.data.description },
    technologies: technologies.data ?? [],
    memory: memory.data ?? [],
    decisions: decisions.data ?? [],
    ai: { enabled: project.data.ai_enabled, allowAutoComplete: project.data.allow_ai_auto_complete, permissions: permissions.data ?? null },
  };
}

export async function listBriefVersions(userId: string, projectId: string): Promise<AgentBriefVersion[]> {
  const { data } = await dataClient(userId)
    .from<AgentBriefVersion>("agent_briefs")
    .select(VERSION_COLUMNS)
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** The latest approved version, or exactly `version`. */
export async function getBriefVersion(db: DataClient, projectId: string, version?: number): Promise<AgentBriefVersion | null> {
  let query = db.from<AgentBriefVersion>("agent_briefs").select(VERSION_COLUMNS).eq("project_id", projectId);
  if (version !== undefined) query = query.eq("version", version);
  const { data } = await query.order("version", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}
