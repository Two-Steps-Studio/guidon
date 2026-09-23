import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { setTaskStatus } from "@/lib/api/task-transitions";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole, withUser } from "@/lib/db/session";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveBoardColumns, type BoardColumnOverride } from "@/lib/work/task-board";
import type { TaskAction, TaskStatus } from "./task-refs";

/** Shown as the author of the comments and status changes the integration makes (actor_label, migration 036). */
export const GITHUB_ACTOR_LABEL = "GitHub";

/**
 * Verifies GitHub's `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with
 * the App's webhook secret). Constant-time; false for a missing or
 * malformed header.
 */
export function verifyGithubSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

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
    .ilike("repo_owner", owner)
    .ilike("repo_name", name)
    .eq("installation_id", installationId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ projectId: row.project_id, connectedBy: row.connected_by, defaultBranch: row.default_branch }));
}

interface ResolvedTask {
  id: string;
  status: TaskStatus;
}

/** `ilike` / LIKE metacharacters can't appear in a validated ref, but escape anyway. */
function likePrefix(ref: string): string {
  return ref.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
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
    if (!(await claimEvent(target.connectedBy, task.id, action.eventKey))) {
      outcome.skipped.push(`${action.ref}: ${action.eventKey} already handled`);
      continue;
    }
    await addComment(target.connectedBy, task.id, action.comment);
    if (
      action.targetStatus &&
      action.targetStatus !== task.status &&
      action.fromStatuses.includes(task.status) &&
      visible.has(action.targetStatus)
    ) {
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

async function visibleStatuses(target: GithubConnectionTarget): Promise<Set<TaskStatus>> {
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
          ? "SELECT id, status FROM tasks WHERE project_id = $1 AND id = $2::uuid LIMIT 2"
          : "SELECT id, status FROM tasks WHERE project_id = $1 AND id::text LIKE $2 LIMIT 2",
        [target.projectId, isFullId ? ref : likePrefix(ref)]
      )
    );
    return result.rows.length === 1 ? (result.rows[0] as ResolvedTask) : null;
  }

  const supabase = await getApiUserClient(target.connectedBy);
  const base = supabase.from("tasks").select("id, status").eq("project_id", target.projectId).limit(2);
  // PostgREST can't LIKE a uuid column directly; the id range for a hex prefix is equivalent.
  const { data } = isFullId
    ? await base.eq("id", ref)
    : await base.gte("id", `${ref}-0000-0000-0000-000000000000`).lte("id", `${ref}-ffff-ffff-ffff-ffffffffffff`);
  return data && data.length === 1 ? (data[0] as ResolvedTask) : null;
}

async function claimEvent(userId: string, taskId: string, eventKey: string): Promise<boolean> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(
        "INSERT INTO github_task_events (task_id, event_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_key",
        [taskId, eventKey]
      )
    );
    return result.rows.length === 1;
  }
  const supabase = await getApiUserClient(userId);
  const { data, error } = await supabase
    .from("github_task_events")
    .upsert({ task_id: taskId, event_key: eventKey }, { onConflict: "task_id,event_key", ignoreDuplicates: true })
    .select("event_key");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

async function addComment(userId: string, taskId: string, content: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withUser(userId, ({ query }) =>
      query("INSERT INTO task_comments (task_id, author_id, content, actor_label) VALUES ($1, $2, $3, $4)", [
        taskId,
        userId,
        content,
        GITHUB_ACTOR_LABEL,
      ])
    );
    return;
  }
  const supabase = await getApiUserClient(userId);
  const { error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: userId, content, actor_label: GITHUB_ACTOR_LABEL });
  if (error) throw new Error(error.message);
}
