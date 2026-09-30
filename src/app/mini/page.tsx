import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/data/current-user";
import {
  canCommentOnProject,
  canManageProject,
  canWriteProject,
  getProjectAccess,
} from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid } from "@/lib/api/validate-id";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";
import { compareTasks, normalizeTaskStatus, resolveBoardColumns, type BoardColumnOverride } from "@/lib/work/task-board";
import type { TaskCardMember } from "@/components/work/task-card";
import type { Task } from "@/types/task";
import { MINI_FILTER_COOKIE, MINI_PROJECT_COOKIE } from "./mini-cookies";
import { MiniTasks, type MiniProject } from "./mini-tasks";

export const metadata: Metadata = {
  title: "Tasks",
  robots: { index: false, follow: false },
};

const TASK_LIMIT = 1000;

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

/**
 * Compact task list for the desktop app's small "Tasks" window
 * (desktop/src-tauri/src/windows.rs) - also usable in any narrow browser
 * window. No app shell/sidebar, one project at a time (?project=<id>).
 */
export default async function MiniTasksPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: projectParam } = await searchParams;
  const [user, t, tWork, cookieStore] = await Promise.all([
    getCurrentUser(),
    getTranslations("mini"),
    getTranslations("work"),
    cookies(),
  ]);

  // RLS (projects_select) limits this to projects the user can see.
  let projects: MiniProject[];
  if (hasDirectDatabase()) {
    const result = await withUser(user.id, ({ query }) =>
      query("SELECT id, name, color FROM projects ORDER BY name ASC LIMIT $1", [PROJECT_LIST_SAFETY_CAP])
    );
    projects = result.rows as MiniProject[];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("projects")
      .select("id, name, color")
      .order("name", { ascending: true })
      .limit(PROJECT_LIST_SAFETY_CAP);
    projects = (data ?? []) as MiniProject[];
  }

  if (projects.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
        <Link href="/projects" className="text-sm font-medium text-primary underline underline-offset-2">
          {t("openProjects")}
        </Link>
      </div>
    );
  }

  // No ?project= - reopen the project last used in this window.
  const requested = projectParam ?? cookieStore.get(MINI_PROJECT_COOKIE)?.value;
  const requestedId = requested && isValidUuid(requested) ? requested : null;
  const projectId = projects.some((project) => project.id === requestedId) ? requestedId! : projects[0].id;
  const access = await getProjectAccess(projectId);
  if (!access) {
    return <p className="p-6 text-center text-sm text-muted-foreground">{t("noAccess")}</p>;
  }

  let tasks: Task[];
  let members: TaskCardMember[];
  let columnOverrides: BoardColumnOverride[];

  if (hasDirectDatabase()) {
    const [tasksRes, membersRes, columnsRes] = await Promise.all([
      withUser(user.id, ({ query }) => query("SELECT * FROM tasks WHERE project_id = $1 LIMIT $2", [projectId, TASK_LIMIT])),
      withUser(user.id, ({ query }) =>
        query(
          `SELECT pm.user_id, p.id AS profile_id, p.full_name, p.email, p.avatar_url
           FROM project_members pm LEFT JOIN profiles p ON p.id = pm.user_id
           WHERE pm.project_id = $1`,
          [projectId]
        )
      ),
      withUser(user.id, ({ query }) =>
        query("SELECT status, label, sort_order, hidden FROM project_board_columns WHERE project_id = $1", [projectId])
      ),
    ]);
    tasks = tasksRes.rows as Task[];
    members = membersRes.rows.map((row) => ({
      id: row.profile_id ?? row.user_id,
      full_name: row.full_name ?? null,
      email: row.email ?? tWork("unknownMember"),
      avatar_url: row.avatar_url ?? null,
    }));
    columnOverrides = columnsRes.rows as BoardColumnOverride[];
  } else {
    const supabase = await createClient();
    const [tasksRes, membersRes, columnsRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", projectId).limit(TASK_LIMIT),
      supabase.from("project_members").select("user_id, profiles ( id, full_name, email, avatar_url )").eq("project_id", projectId),
      supabase.from("project_board_columns").select("status, label, sort_order, hidden").eq("project_id", projectId),
    ]);
    tasks = (tasksRes.data ?? []) as Task[];
    members = ((membersRes.data ?? []) as { user_id: string; profiles: ProfileRow | ProfileRow[] | null }[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: profile?.id ?? row.user_id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? tWork("unknownMember"),
        avatar_url: profile?.avatar_url ?? null,
      };
    });
    columnOverrides = (columnsRes.data ?? []) as BoardColumnOverride[];
  }

  tasks = tasks.slice().sort(compareTasks);
  const resolvedColumns = resolveBoardColumns(columnOverrides, (status) => ({
    label: tWork("status", { status }),
    hint: tWork("statusHint", { status }),
  }));
  // Same rule as the Work board: no "AI Working" column on an AI-off project
  // unless a task is still sitting in it.
  const keepAiColumn =
    access.project.ai_enabled ||
    tasks.some((task) => !task.parent_task_id && normalizeTaskStatus(task.status) === "ai_working");
  const columns = keepAiColumn ? resolvedColumns : resolvedColumns.filter((column) => column.status !== "ai_working");

  return (
    <MiniTasks
      key={projectId}
      projects={projects}
      projectId={projectId}
      initialFilter={cookieStore.get(MINI_FILTER_COOKIE)?.value === "all" ? "all" : "mine"}
      userId={user.id}
      canWrite={canWriteProject(access.role)}
      canComment={canCommentOnProject(access.role)}
      canDelete={canManageProject(access.role)}
      aiEnabled={access.project.ai_enabled}
      initialTasks={tasks}
      members={members}
      columns={columns}
    />
  );
}
