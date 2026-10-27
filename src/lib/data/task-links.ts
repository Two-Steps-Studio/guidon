import "server-only";
import type { DataClient } from "@/lib/data-client";

/**
 * Smart Linking (migration 097): the commits, branches and PRs linked to a
 * task, and the review of a link (confirm a suggestion, or mark any link as
 * not related). Shared by the task dialog's Server Actions, /api/v1 and the
 * MCP tools; every query runs under RLS as the caller (members read,
 * owner/admin/developer review).
 */

export type TaskLink = {
  id: string;
  task_id: string;
  kind: "commit" | "pull_request" | "branch";
  repository: string;
  external_ref: string;
  title: string | null;
  url: string | null;
  pr_state: "open" | "draft" | "merged" | "closed" | null;
  status: "confirmed" | "suggested" | "rejected";
  provenance: "explicit_reference" | "manual" | "suggestion";
  confidence: number;
  evidence: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  /** False when the repository is no longer connected to the project (disconnected, renamed or deleted): the link stays as history. */
  repository_connected?: boolean;
};

export const TASK_LINK_COLUMNS = "id, task_id, kind, repository, external_ref, title, url, pr_state, status, provenance, confidence, evidence, decided_by, decided_at, created_at, updated_at";

const normalize = (row: TaskLink): TaskLink => ({
  ...row,
  confidence: Number(row.confidence),
  decided_at: row.decided_at ? new Date(row.decided_at).toISOString() : null,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
});

/** Links of a task in its project: confirmed first, then suggestions by confidence, then rejected. */
export async function listTaskLinks(db: DataClient, projectId: string, taskId: string): Promise<{ links: TaskLink[]; error: string | null }> {
  const [{ data, error }, connection] = await Promise.all([
    db.from<TaskLink>("task_links").select(TASK_LINK_COLUMNS).eq("project_id", projectId).eq("task_id", taskId).order("created_at", { ascending: false }).limit(200),
    db.from<{ repo_owner: string; repo_name: string }>("github_connections").select("repo_owner, repo_name").eq("project_id", projectId).maybeSingle(),
  ]);
  if (error) return { links: [], error: "Could not load the linked code." };
  const connected = connection.data ? `${connection.data.repo_owner}/${connection.data.repo_name}`.toLowerCase() : null;
  const rank = { confirmed: 0, suggested: 1, rejected: 2 } as const;
  return {
    links: data.map((row) => ({ ...normalize(row), repository_connected: connected === row.repository.toLowerCase() }))
      .sort((left, right) => rank[left.status] - rank[right.status] || right.confidence - left.confidence),
    error: null,
  };
}

export type ReviewDecision = "confirm" | "reject";

/** Confirms or rejects one link of this project (and task, when given). Scoped by id and project; zero rows means not found or not allowed. */
export async function reviewTaskLink(db: DataClient, userId: string, projectId: string, linkId: string, decision: ReviewDecision, taskId?: string): Promise<{ link: TaskLink | null; error: "not_found" | "invalid" | "failed" | null }> {
  if (decision !== "confirm" && decision !== "reject") return { link: null, error: "invalid" };
  let query = db.from<TaskLink>("task_links")
    .update({ status: decision === "confirm" ? "confirmed" : "rejected", decided_by: userId, decided_at: new Date().toISOString() })
    .eq("id", linkId).eq("project_id", projectId);
  if (taskId) query = query.eq("task_id", taskId);
  const { data, error } = await query.select(TASK_LINK_COLUMNS);
  if (error) return { link: null, error: "failed" };
  if (!data.length) return { link: null, error: "not_found" };
  return { link: normalize(data[0]), error: null };
}
