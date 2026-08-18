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
 */
async function loadCommentCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskIds: string[]
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};

  const { data, error } = await supabase
    .from("task_comments")
    .select("task_id")
    .in("task_id", taskIds);

  if (error || !data) return {};

  return (data as { task_id: string }[]).reduce<Record<string, number>>((counts, row) => {
    counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
    return counts;
  }, {});
}

async function loadCommentCountsLocal(
  userId: string,
  taskIds: string[]
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};

  const result = await withUser(userId, ({ query }) =>
    query("SELECT task_id FROM task_comments WHERE task_id = ANY($1::uuid[])", [taskIds])
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

  if (hasDirectDatabase()) {
    const [tasksRes, membersRes] = await withUser(access.userId, ({ query }) =>
      Promise.all([
        query("SELECT * FROM tasks WHERE project_id = $1", [projectId]),
        query(
          `SELECT pm.user_id, p.id AS profile_id, p.full_name, p.email, p.avatar_url
           FROM project_members pm
           LEFT JOIN profiles p ON p.id = pm.user_id
           WHERE pm.project_id = $1`,
          [projectId]
        ),
      ])
    );

    // profiles may be null for teammates until migration 003 is applied;
    // fall back to a stable placeholder rather than dropping the member.
    members = membersRes.rows.map((row) => ({
      id: row.profile_id ?? row.user_id,
      full_name: row.full_name ?? null,
      email: row.email ?? "Unknown member",
      avatar_url: row.avatar_url ?? null,
    }));

    tasks = tasksRes.rows.slice().sort(compareTasks);
    commentCounts = await loadCommentCountsLocal(access.userId, tasks.map((task) => task.id));
  } else {
    const supabase = await createClient();

    const [tasksRes, membersRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", projectId),
      supabase
        .from("project_members")
        .select("user_id, profiles ( id, full_name, email, avatar_url )")
        .eq("project_id", projectId),
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
    commentCounts = await loadCommentCounts(supabase, tasks.map((task) => task.id));
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
    />
  );
}
