import { canCommentOnProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
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

export default async function ProjectWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
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
  const members: TaskCardMember[] = ((membersRes.data ?? []) as MemberRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: profile?.id ?? row.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "Unknown member",
      avatar_url: profile?.avatar_url ?? null,
    };
  });

  const tasks = ((tasksRes.data ?? []) as Task[]).slice().sort(compareTasks);
  const commentCounts = await loadCommentCounts(supabase, tasks.map((task) => task.id));

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
