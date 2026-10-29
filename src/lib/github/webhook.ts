import "server-only";

import { getApiUserClient } from "@/lib/api/api-key-auth";
import { setTaskStatus } from "@/lib/api/task-transitions";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole, withUser } from "@/lib/db/session";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveBoardColumns, type BoardColumnOverride } from "@/lib/work/task-board";
import { shouldMove, type TaskAction } from "./task-refs";
import { nextPrState, suggestLinks, type LinkSpec, type PrState } from "./link-core";
import { dataClient } from "@/lib/data-client";

/** Shown as the author of the comments and status changes the integration makes (actor_label, migration 036). */
export const GITHUB_ACTOR_LABEL = "GitHub";

export { verifyGithubSignature } from "./signature";

export interface GithubConnectionTarget {
  projectId: string;
  /** The person who connected the repository - the integration writes as them, under RLS. */
  connectedBy: string;
  defaultBranch: string;
}

/**
 * The Guidon projects connected to this repository through the GitHub App
 * (github_connections, 021/022). Read with the service role because a
 * webhook has no user; only non-secret columns, and only rows whose
 * installation matches the one GitHub says sent the event - a repository
 * that changed hands and was reconnected elsewhere doesn't keep feeding the
 * old project.
 */
export async function findConnections(owner: string, name: string, installationId: number | null): Promise<GithubConnectionTarget[]> {
  if (!owner || !name || installationId === null) return [];

  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query(
        `SELECT project_id, connected_by, default_branch FROM github_connections
         WHERE lower(repo_owner) = lower($1) AND lower(repo_name) = lower($2) AND installation_id = $3`,
        [owner, name, installationId]
      )
    );
    return result.rows.map((row) => ({ projectId: row.project_id, connectedBy: row.connected_by, defaultBranch: row.default_branch }));
  }

  const { data, error } = await createServiceClient()
    .from("github_connections")
    .select("project_id, connected_by, default_branch")
    .ilike("repo_owner", escapeLike(owner))
    .ilike("repo_name", escapeLike(name))
    .eq("installation_id", installationId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ projectId: row.project_id, connectedBy: row.connected_by, defaultBranch: row.default_branch }));
}

interface ResolvedTask {
  id: string;
  status: string;
  is_done: boolean;
}

/** Escapes LIKE metacharacters - `_` is legal in GitHub repository names and would otherwise match any character. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Metacharacters can't appear in a validated ref, but escape anyway. */
function likePrefix(ref: string): string {
  return escapeLike(ref) + "%";
}

export interface ApplyOutcome {
  applied: number;
  skipped: string[];
}

/**
 * Applies the planned actions for one connected project, as the person who
 * connected it. A ref must match exactly one task in the project (an
 * ambiguous 8-char prefix is skipped rather than guessed); each
 * (task, event) acts once; a status only moves if the task is currently in
 * one of the action's `fromStatuses` and the target column is visible on
 * that project's board.
 */
export async function applyActions(target: GithubConnectionTarget, actions: TaskAction[]): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { applied: 0, skipped: [] };
  if (actions.length === 0) return outcome;
  const visible = await visibleStatuses(target);

  for (const action of actions) {
    const task = await resolveTask(target, action.ref);
    if (!task) {
      outcome.skipped.push(`${action.ref}: no single matching task`);
      continue;
    }
    if (!(await recordEvent(target.connectedBy, task.id, action.eventKey, action.comment))) {
      outcome.skipped.push(`${action.ref}: ${action.eventKey} already handled`);
      continue;
    }
    if (action.targetStatus && shouldMove(action, task.status, task.is_done) && visible.has(action.targetStatus)) {
      const result = await setTaskStatus(target.connectedBy, task.id, action.targetStatus, {
        humanClient: true,
        botLabel: GITHUB_ACTOR_LABEL,
      });
      if (!result.ok) outcome.skipped.push(`${action.ref}: status not changed (${result.error})`);
    }
    outcome.applied++;
  }
  return outcome;
}

async function visibleStatuses(target: GithubConnectionTarget): Promise<Set<string>> {
  let overrides: BoardColumnOverride[] = [];
  if (hasDirectDatabase()) {
    const result = await withUser(target.connectedBy, ({ query }) =>
      query("SELECT status, label, sort_order, hidden FROM project_board_columns WHERE project_id = $1", [target.projectId])
    );
    overrides = result.rows;
  } else {
    const supabase = await getApiUserClient(target.connectedBy);
    const { data } = await supabase
      .from("project_board_columns")
      .select("status, label, sort_order, hidden")
      .eq("project_id", target.projectId);
    overrides = (data ?? []) as BoardColumnOverride[];
  }
  return new Set(resolveBoardColumns(overrides).map((column) => column.status));
}

async function resolveTask(target: GithubConnectionTarget, ref: string): Promise<ResolvedTask | null> {
  const isFullId = ref.length === 36;
  if (hasDirectDatabase()) {
    const result = await withUser(target.connectedBy, ({ query }) =>
      query(
        isFullId
          ? "SELECT id, status, is_done FROM tasks WHERE project_id = $1 AND id = $2::uuid LIMIT 2"
          : "SELECT id, status, is_done FROM tasks WHERE project_id = $1 AND id::text LIKE $2 LIMIT 2",
        [target.projectId, isFullId ? ref : likePrefix(ref)]
      )
    );
    return result.rows.length === 1 ? (result.rows[0] as ResolvedTask) : null;
  }

  const supabase = await getApiUserClient(target.connectedBy);
  const base = supabase.from("tasks").select("id, status, is_done").eq("project_id", target.projectId).limit(2);
  // PostgREST can't LIKE a uuid column directly; the id range for a hex prefix is equivalent.
  const { data } = isFullId
    ? await base.eq("id", ref)
    : await base.gte("id", `${ref}-0000-0000-0000-000000000000`).lte("id", `${ref}-ffff-ffff-ffff-ffffffffffff`);
  return data && data.length === 1 ? (data[0] as ResolvedTask) : null;
}

/**
 * Claims (task, event) and posts its comment as one unit, so a failed
 * comment never leaves the event marked handled - a Redeliver from GitHub
 * would otherwise be skipped as "already handled". Returns false when the
 * event was already recorded.
 */
async function recordEvent(userId: string, taskId: string, eventKey: string, content: string): Promise<boolean> {
  if (hasDirectDatabase()) {
    // withUser runs in one transaction: a failed comment rolls the claim back.
    return withUser(userId, async ({ query }) => {
      const claimed = await query(
        "INSERT INTO github_task_events (task_id, event_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_key",
        [taskId, eventKey]
      );
      if (claimed.rows.length === 0) return false;
      await query("INSERT INTO task_comments (task_id, author_id, content, actor_label) VALUES ($1, $2, $3, $4)", [
        taskId,
        userId,
        content,
        GITHUB_ACTOR_LABEL,
      ]);
      return true;
    });
  }

  const supabase = await getApiUserClient(userId);
  const { data, error } = await supabase
    .from("github_task_events")
    .upsert({ task_id: taskId, event_key: eventKey }, { onConflict: "task_id,event_key", ignoreDuplicates: true })
    .select("event_key");
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) return false;

  const { error: commentError } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: userId, content, actor_label: GITHUB_ACTOR_LABEL });
  if (commentError) {
    // PostgREST can't span both writes in a transaction, and 042 grants no
    // DELETE to `authenticated` - release the claim with the service role,
    // scoped to exactly the row inserted above.
    await createServiceClient().from("github_task_events").delete().eq("task_id", taskId).eq("event_key", eventKey);
    throw new Error(commentError.message);
  }
  return true;
}

type TaskLinkRow = { id: string; status: string; provenance: string; pr_state: PrState | null; title: string | null; url: string | null };

/**
 * Smart Linking (migration 097): records the commit/branch/PR <-> task links
 * an event carries, as the person who connected the repository (RLS). An
 * explicit reference is a confirmed link; a PR that references no task gets
 * at most three suggestions (link-core.ts). A link someone rejected stays
 * rejected; later events only update a PR's state, title and URL. Never
 * throws - links must not block the comments and status moves above.
 */
export async function applyLinks(target: GithubConnectionTarget, repository: string, links: LinkSpec[], suggestFrom: string | null, prLink: Omit<LinkSpec, "ref" | "evidence"> | null): Promise<{ linked: number; suggested: number }> {
  const outcome = { linked: 0, suggested: 0 };
  const db = dataClient(target.connectedBy, { supabase: () => getApiUserClient(target.connectedBy) });
  try {
    for (const link of links) {
      const task = await resolveTask(target, link.ref);
      if (!task) continue;
      const existing = await db.from<TaskLinkRow>("task_links").select("id, status, provenance, pr_state, title, url")
        .eq("task_id", task.id).eq("kind", link.kind).eq("repository", repository).eq("external_ref", link.externalRef).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) {
        const inserted = await db.from("task_links").insert({
          task_id: task.id, project_id: target.projectId, kind: link.kind, repository, external_ref: link.externalRef, title: link.title, url: link.url,
          pr_state: link.prState, status: "confirmed", provenance: "explicit_reference", confidence: 1, evidence: link.evidence,
        }).select("id");
        if (inserted.error && inserted.error.code !== "23505") throw new Error(inserted.error.message);
        if (!inserted.error) outcome.linked++;
        continue;
      }
      if (existing.data.status === "rejected") continue;
      const patch: Record<string, unknown> = {};
      // Events can arrive out of order: a late "opened" never un-merges a PR.
      const prState = nextPrState(existing.data.pr_state, link.prState, link.prAction);
      if (prState !== existing.data.pr_state) patch.pr_state = prState;
      if (link.title && link.title !== existing.data.title) patch.title = link.title;
      if (link.url && link.url !== existing.data.url) patch.url = link.url;
      // A suggestion the code now references explicitly is confirmed by that reference.
      if (existing.data.status === "suggested") Object.assign(patch, { status: "confirmed", evidence: link.evidence, decided_at: new Date().toISOString() });
      if (Object.keys(patch).length) {
        const updated = await db.from("task_links").update(patch).eq("id", existing.data.id).eq("project_id", target.projectId).select("id");
        if (updated.error) throw new Error(updated.error.message);
      }
    }

    if (suggestFrom && prLink && links.length === 0) {
      const open = await db.from<{ id: string; title: string }>("tasks").select("id, title").eq("project_id", target.projectId).eq("is_done", false).is("parent_task_id", null).limit(500);
      if (open.error) throw new Error(open.error.message);
      for (const suggestion of suggestLinks(suggestFrom, open.data ?? [])) {
        const inserted = await db.from("task_links").insert({
          task_id: suggestion.taskId, project_id: target.projectId, kind: prLink.kind, repository, external_ref: prLink.externalRef, title: prLink.title, url: prLink.url,
          pr_state: prLink.prState, status: "suggested", provenance: "suggestion", confidence: suggestion.confidence, evidence: suggestion.evidence,
        }).select("id");
        if (inserted.error && inserted.error.code !== "23505") throw new Error(inserted.error.message);
        if (!inserted.error) outcome.suggested++;
      }
    }
  } catch (error) {
    console.error("[GitHub webhook] links for project", target.projectId, error instanceof Error ? error.message : error);
  }
  return outcome;
}
