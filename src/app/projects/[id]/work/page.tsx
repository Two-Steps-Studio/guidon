import { canCommentOnProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { compareTasks } from "@/lib/work/task-board";
import { WorkBoard } from "./work-board";
import type { TaskCardMember } from "@/components/work/task-card";
import type { Task } from "@/types/task";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

/** PostgREST types an embedded relation as an array or a single object depending on inferred cardinality. */
interface MemberRow {
  user_id: string;
  profiles: ProfileRow | ProfileRow[] | null;
}

/**
 * task_comments has no aggregate endpoint through PostgREST without a view,
 * so counts are derived from a single scoped id fetch. Cheap at MVP volumes
 * and avoids adding a database view before it is needed.
 *
 * Scoped by project_id (via the tasks join) rather than a resolved task id
 * list, so this can run in the same Promise.all as the tasks/members
 * queries instead of waiting on tasks to resolve first.
 */
async function loadCommentCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("task_comments")
    .select("task_id, tasks!inner(project_id)")
    .eq("tasks.project_id", projectId);

  if (error || !data) return {};

  return (data as { task_id: string }[]).reduce<Record<string, number>>((counts, row) => {
    counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
    return counts;
  }, {});
}

async function loadCommentCountsLocal(
  userId: string,
  projectId: string
): Promise<Record<string, number>> {
  const result = await withUser(userId, ({ query }) =>
    query(
      `SELECT tc.task_id FROM task_comments tc
       JOIN tasks t ON t.id = tc.task_id
       WHERE t.project_id = $1`,
      [projectId]
    )
  );

  return result.rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
    return counts;
  }, {});
}

export default async function ProjectWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let tasks: Task[];
  let members: TaskCardMember[];
  let commentCounts: Record<string, number>;

  // TASK_LIMIT is a safety cap, not pagination — high enough that no real
  // project's board should ever hit it today, low enough to stop an
  // unbounded SELECT * from becoming a real cost as projects grow.
  const TASK_LIMIT = 1000;

  if (hasDirectDatabase()) {
    // Each withUser() call owns its own pooled connection, so these three
    // run as genuinely concurrent queries rather than one after another.
    const [tasksRes, membersRes, commentCountRows] = await Promise.all([
      withUser(access.userId, ({ query }) =>
        query("SELECT * FROM tasks WHERE project_id = $1 LIMIT $2", [projectId, TASK_LIMIT])
      ),
      withUser(access.userId, ({ query }) =>
        query(
          `SELECT pm.user_id, p.id AS profile_id, p.full_name, p.email, p.avatar_url
           FROM project_members pm
           LEFT JOIN profiles p ON p.id = pm.user_id
           WHERE pm.project_id = $1`,
          [projectId]
        )
      ),
      loadCommentCountsLocal(access.userId, projectId),
    ]);

    // profiles may be null for teammates until migration 003 is applied;
    // fall back to a stable placeholder rather than dropping the member.
    members = membersRes.rows.map((row) => ({
      id: row.profile_id ?? row.user_id,
      full_name: row.full_name ?? null,
      email: row.email ?? "Unknown member",
      avatar_url: row.avatar_url ?? null,
    }));

    tasks = tasksRes.rows.slice().sort(compareTasks);
    commentCounts = commentCountRows;
  } else {
    const supabase = await createClient();

    const [tasksRes, membersRes, commentCounts_] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", projectId).limit(TASK_LIMIT),
      supabase
        .from("project_members")
        .select("user_id, profiles ( id, full_name, email, avatar_url )")
        .eq("project_id", projectId),
      loadCommentCounts(supabase, projectId),
    ]);

    // profiles may be null for teammates until migration 003 is applied;
    // fall back to a stable placeholder rather than dropping the member.
    members = ((membersRes.data ?? []) as MemberRow[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: profile?.id ?? row.user_id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? "Unknown member",
        avatar_url: profile?.avatar_url ?? null,
      };
    });

    tasks = ((tasksRes.data ?? []) as Task[]).slice().sort(compareTasks);
    commentCounts = commentCounts_;
  }

  return (
    <WorkBoard
      projectId={projectId}
      projectName={access.project.name}
      userId={access.userId}
      role={access.role}
      canWrite={canWriteProject(access.role)}
      canComment={canCommentOnProject(access.role)}
      initialTasks={tasks}
      members={members}
      initialCommentCounts={commentCounts}
      projectColor={access.project.color}
    />
  );
}
