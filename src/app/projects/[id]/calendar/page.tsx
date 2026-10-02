import { getTranslations } from "next-intl/server";
import {
  canCommentOnProject,
  canManageProject,
  canWriteProject,
  requireProjectAccess,
} from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { buildMonthGrid, layoutPhases, parseMonthParam, type CalendarPhaseInput } from "@/lib/work/calendar";
import { CalendarView, type CalendarPhase } from "./calendar-view";
import type { TaskCardMember } from "@/components/work/task-card";
import type { PhaseStatus, Task } from "@/types/task";

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

interface PhaseRow extends CalendarPhaseInput {
  name: string;
  status: PhaseStatus;
}

const CALENDAR_PHASE_COLUMNS = "id, name, status, start_date, planned_end_date, actual_end_date";
// Same cap the roadmap page lists with; phases are filtered to the visible
// month in JS since "overlaps the range" needs COALESCE over three date
// columns, which PostgREST filters can't express.
const PHASE_LIMIT = 200;

const CALENDAR_TASK_COLUMNS =
  "id, project_id, title, description, status, priority, tags, due_date, progress_percent, assignee_id, estimated_hours, actual_hours, sort_order, decision_id, created_by, created_at, updated_at, parent_task_id";

/**
 * Month view of every task with a due date (src/lib/work/calendar.ts builds
 * the grid). Only top-level tasks matter here - a subtask due date has no
 * dedicated UI anywhere else either, and pulling every subtask in just to
 * filter most of them back out isn't worth it for a month overview.
 */
export default async function ProjectCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id: projectId } = await params;
  const { month: monthParam } = await searchParams;
  const access = await requireProjectAccess(projectId);
  const tWork = await getTranslations("work");
  const tCalendar = await getTranslations("calendar");

  const { year, month } = parseMonthParam(monthParam, new Date());
  const grid = buildMonthGrid(year, month);

  let tasks: Task[];
  let members: TaskCardMember[];
  let phaseRows: PhaseRow[];

  if (hasDirectDatabase()) {
    const [tasksRes, membersRes, phasesRes] = await Promise.all([
      withUser(access.userId, ({ query }) =>
        query(
          `SELECT ${CALENDAR_TASK_COLUMNS} FROM tasks
           WHERE project_id = $1 AND parent_task_id IS NULL
             AND due_date >= $2 AND due_date < $3
           ORDER BY due_date ASC`,
          [projectId, grid.rangeStart, grid.rangeEnd]
        )
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
      withUser(access.userId, ({ query }) =>
        query(
          `SELECT ${CALENDAR_PHASE_COLUMNS} FROM roadmap_phases
           WHERE project_id = $1 ORDER BY sort_order ASC NULLS LAST LIMIT $2`,
          [projectId, PHASE_LIMIT]
        )
      ),
    ]);

    tasks = tasksRes.rows as Task[];
    phaseRows = phasesRes.rows as PhaseRow[];
    members = membersRes.rows.map((row) => ({
      id: row.profile_id ?? row.user_id,
      full_name: row.full_name ?? null,
      email: row.email ?? tWork("unknownMember"),
      avatar_url: row.avatar_url ?? null,
    }));
  } else {
    const supabase = await createClient();
    const [tasksRes, membersRes, phasesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(CALENDAR_TASK_COLUMNS)
        .eq("project_id", projectId)
        .is("parent_task_id", null)
        .gte("due_date", grid.rangeStart)
        .lt("due_date", grid.rangeEnd)
        .order("due_date", { ascending: true }),
      supabase
        .from("project_members")
        .select("user_id, profiles ( id, full_name, email, avatar_url )")
        .eq("project_id", projectId),
      supabase
        .from("roadmap_phases")
        .select(CALENDAR_PHASE_COLUMNS)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .limit(PHASE_LIMIT),
    ]);

    tasks = (tasksRes.data ?? []) as unknown as Task[];
    phaseRows = (phasesRes.data ?? []) as PhaseRow[];
    members = ((membersRes.data ?? []) as MemberRow[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: profile?.id ?? row.user_id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? tWork("unknownMember"),
        avatar_url: profile?.avatar_url ?? null,
      };
    });
  }

  const phases: CalendarPhase[] = layoutPhases(phaseRows, grid.rangeStart, grid.rangeEnd).map(
    ({ phase, start, end, lane }) => ({ id: phase.id, name: phase.name, status: phase.status, start, end, lane })
  );

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{tCalendar("title")}</h1>
        <p className="text-muted-foreground">{tCalendar("subtitle")}</p>
      </div>
      <CalendarView
        projectId={projectId}
        grid={grid}
        initialTasks={tasks}
        phases={phases}
        members={members}
        currentUserId={access.userId}
        canEdit={canWriteProject(access.role)}
        canDelete={canManageProject(access.role)}
        canComment={canCommentOnProject(access.role)}
      />
    </div>
  );
}
