import { getTranslations } from "next-intl/server";
import { showAi } from "@/lib/data/ai-preference";
import { canCommentOnProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { getLabelPresets } from "@/lib/data/label-presets";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isAIAvailableForOrg } from "@/lib/ai/resolve-provider";
import { normalizeTaskStatus, resolveBoardColumns, resolvePriorities, taskComparator } from "@/lib/work/task-board";
import { getWorkflowOverrides } from "@/lib/data/workflow";
import { getSignedCoverUrl } from "@/lib/storage/storage";
import { purgeFinishedTasks } from "@/lib/work/finished-cleanup";
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

/**
 * Cover thumbnail for each task's card: the most recently uploaded
 * image-type attachment, if any. Same "cheap at MVP volumes" tradeoff as
 * loadCommentCounts above, plus one signed-URL call per task that has an
 * image (a real Supabase Storage API round trip on the hosted path,
 * essentially free HMAC signing on the local one) - acceptable alongside
 * TASK_LIMIT's own soft cap on board size, and only paid by tasks that
 * actually have an image, not every task on the board.
 */
async function signCoverImagePaths(pathsByTask: Map<string, string>): Promise<Record<string, string>> {
  const entries = await Promise.all(
    [...pathsByTask.entries()].map(async ([taskId, storagePath]) => {
      try {
        const url = await getSignedCoverUrl(storagePath);
        return [taskId, url] as const;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null));
}

async function loadCoverImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("task_attachments")
    .select("task_id, storage_path, created_at, tasks!inner(project_id)")
    .eq("tasks.project_id", projectId)
    .like("mime_type", "image/%")
    .order("created_at", { ascending: false });

  if (error || !data) return {};

  const pathsByTask = new Map<string, string>();
  for (const row of data as { task_id: string; storage_path: string }[]) {
    // Rows arrive newest-first; the first one seen per task is its cover.
    if (!pathsByTask.has(row.task_id)) pathsByTask.set(row.task_id, row.storage_path);
  }
  return signCoverImagePaths(pathsByTask);
}

async function loadCoverImagesLocal(userId: string, projectId: string): Promise<Record<string, string>> {
  const result = await withUser(userId, ({ query }) =>
    query(
      `SELECT DISTINCT ON (ta.task_id) ta.task_id, ta.storage_path
         FROM task_attachments ta
         JOIN tasks t ON t.id = ta.task_id
        WHERE t.project_id = $1 AND ta.mime_type LIKE 'image/%'
        ORDER BY ta.task_id, ta.created_at DESC`,
      [projectId]
    )
  );

  const pathsByTask = new Map<string, string>();
  for (const row of result.rows) pathsByTask.set(row.task_id, row.storage_path);
  return signCoverImagePaths(pathsByTask);
}

export default async function ProjectWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { id: projectId } = await params;
  // ?welcome=1: just created through onboarding (app/start/finish).
  const { welcome } = await searchParams;
  const tWork = await getTranslations("work");
  const access = await requireProjectAccess(projectId);

  // Only depends on `access` (already resolved), not on tasks/members/etc
  // below - started here rather than awaited inline in the JSX below so it
  // runs alongside that Promise.all instead of as a second sequential
  // round-trip tacked onto the end of the page.
  // Migration 046: a project can switch every AI feature off at once - no
  // point asking the org whether a provider is configured then. 099: a
  // person can also hide AI for themselves.
  const aiEnabled = await showAi(access.userId, access.project.ai_enabled);
  const labelPresetsPromise = getLabelPresets(access.userId, projectId);
  const workflowPromise = getWorkflowOverrides(access.userId, projectId);
  const aiAvailablePromise = aiEnabled
    ? isAIAvailableForOrg(access.project.organization_id, access.userId)
    : Promise.resolve(false);

  // Before the tasks are read, so tasks past the project's "delete finished
  // tasks after N days" setting are already gone from this render.
  await purgeFinishedTasks(access.userId, projectId);

  let tasks: Task[];
  let members: TaskCardMember[];
  let commentCounts: Record<string, number>;
  let coverImages: Record<string, string>;

  // TASK_LIMIT is a safety cap, not pagination: it stops an unbounded
  // SELECT * as projects grow. Past it the board keeps open tasks first,
  // most recently updated first (not an arbitrary subset), and says so -
  // one extra row tells whether anything was left out.
  const TASK_LIMIT = 1000;

  if (hasDirectDatabase()) {
    // Each withUser() call owns its own pooled connection, so these five
    // run as genuinely concurrent queries rather than one after another.
    const [tasksRes, membersRes, commentCountRows, coverImageRows] = await Promise.all([
      withUser(access.userId, ({ query }) =>
        query("SELECT * FROM tasks WHERE project_id = $1 ORDER BY is_done, updated_at DESC, id LIMIT $2", [projectId, TASK_LIMIT + 1])
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
      loadCoverImagesLocal(access.userId, projectId),
    ]);

    // profiles may be null for teammates until migration 003 is applied;
    // fall back to a stable placeholder rather than dropping the member.
    members = membersRes.rows.map((row) => ({
      id: row.profile_id ?? row.user_id,
      full_name: row.full_name ?? null,
      email: row.email ?? tWork("unknownMember"),
      avatar_url: row.avatar_url ?? null,
    }));

    tasks = tasksRes.rows;
    commentCounts = commentCountRows;
    coverImages = coverImageRows;
  } else {
    const supabase = await createClient();

    const [tasksRes, membersRes, commentCounts_, coverImages_] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", projectId)
        .order("is_done", { ascending: true }).order("updated_at", { ascending: false }).order("id").limit(TASK_LIMIT + 1),
      supabase
        .from("project_members")
        .select("user_id, profiles ( id, full_name, email, avatar_url )")
        .eq("project_id", projectId),
      loadCommentCounts(supabase, projectId),
      loadCoverImages(supabase, projectId),
    ]);

    // profiles may be null for teammates until migration 003 is applied;
    // fall back to a stable placeholder rather than dropping the member.
    members = ((membersRes.data ?? []) as MemberRow[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: profile?.id ?? row.user_id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? tWork("unknownMember"),
        avatar_url: profile?.avatar_url ?? null,
      };
    });

    tasks = (tasksRes.data ?? []) as Task[];
    commentCounts = commentCounts_;
    coverImages = coverImages_;
  }

  const capped = tasks.length > TASK_LIMIT;
  if (capped) tasks = tasks.slice(0, TASK_LIMIT);

  const workflow = await workflowPromise;
  const priorities = resolvePriorities(workflow.priorities, (priority) => tWork("priority", { priority }));
  tasks = tasks.slice().sort(taskComparator(priorities));
  const resolvedColumns = resolveBoardColumns(workflow.columns, (status) => ({
    label: tWork("status", { status }),
    hint: tWork("statusHint", { status }),
  }));
  // With AI off the "AI Working" column goes away - unless a board task is
  // still sitting in it (from before AI was switched off, or an agent
  // mid-task), in which case hiding it would make that task vanish from the
  // board entirely. It disappears on its own once emptied. Subtasks aren't
  // board cards, so they don't keep it around.
  const hasAiWorkingTasks = tasks.some(
    (task) => !task.parent_task_id && normalizeTaskStatus(task.status) === "ai_working"
  );
  const columns =
    aiEnabled || hasAiWorkingTasks
      ? resolvedColumns
      : resolvedColumns.filter((column) => column.status !== "ai_working");

  return (
    <WorkBoard
      welcome={welcome === "1"}
      projectId={projectId}
      projectName={access.project.name}
      userId={access.userId}
      role={access.role}
      canWrite={canWriteProject(access.role)}
      canComment={canCommentOnProject(access.role)}
      initialTasks={tasks}
      members={members}
      initialCommentCounts={commentCounts}
      initialCoverImages={coverImages}
      projectColor={access.project.color}
      columns={columns}
      aiAvailable={await aiAvailablePromise}
      aiEnabled={aiEnabled}
      labelPresets={await labelPresetsPromise}
      priorities={priorities}
      boardLimit={capped ? TASK_LIMIT : null}
    />
  );
}
