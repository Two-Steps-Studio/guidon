import { BOARD_COLUMNS } from "@/lib/work/task-board";
import type { Task } from "@/types/task";
import type { TaskCardMember } from "@/components/work/task-card";

/**
 * Static sample data for the landing page's live board preview
 * (src/app/page.tsx) - the actual KanbanBoard/TaskCard components rendered
 * with canEdit={false}, not a screenshot. Real component, fake data: this
 * stays visually correct automatically as the board's own styling evolves,
 * instead of a static image going stale the next time task-card.tsx changes.
 *
 * Not tied to any real project/organization - ids are simple demo-* strings,
 * never sent to the server (canEdit=false means no mutation ever fires).
 */

const now = new Date().toISOString();

export const DEMO_MEMBERS: TaskCardMember[] = [
  { id: "demo-member-1", full_name: "Alex Chen", email: "alex@example.com", avatar_url: null },
  { id: "demo-member-2", full_name: "Priya Patel", email: "priya@example.com", avatar_url: null },
  { id: "demo-member-3", full_name: "Sam Osei", email: "sam@example.com", avatar_url: null },
];

function task(overrides: Partial<Task> & Pick<Task, "id" | "title" | "status">): Task {
  return {
    project_id: "demo-project",
    description: null,
    priority: "medium",
    tags: [],
    due_date: null,
    progress_percent: 0,
    assignee_id: null,
    estimated_hours: null,
    actual_hours: null,
    sort_order: 0,
    decision_id: null,
    parent_task_id: null,
    created_by: "demo-member-1",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export const DEMO_TASKS: Task[] = [
  task({
    id: "demo-1",
    title: "Design the onboarding checklist",
    status: "backlog",
    priority: "low",
    tags: ["design"],
  }),
  task({
    id: "demo-2",
    title: "Evaluate self-hosted storage providers",
    status: "backlog",
    priority: "medium",
    tags: ["infra"],
  }),
  task({
    id: "demo-3",
    title: "Write API docs for the webhook endpoint",
    status: "todo",
    priority: "medium",
    tags: ["docs"],
    due_date: "2026-10-02",
    assignee_id: "demo-member-2",
  }),
  task({
    id: "demo-4",
    title: "Fix pagination on the activity log",
    status: "todo",
    priority: "high",
    tags: ["bug"],
    assignee_id: "demo-member-3",
  }),
  task({
    id: "demo-5",
    title: "Add rate limiting to the comments endpoint",
    status: "in_progress",
    priority: "high",
    tags: ["backend", "security"],
    due_date: "2026-09-28",
    assignee_id: "demo-member-1",
    progress_percent: 60,
  }),
  task({
    id: "demo-6",
    title: "Migrate the file uploader to the new storage API",
    status: "ai_working",
    priority: "medium",
    tags: ["backend"],
    assignee_id: "demo-member-2",
  }),
  task({
    id: "demo-7",
    title: "Review: dark mode contrast pass",
    status: "review",
    priority: "low",
    tags: ["design"],
    assignee_id: "demo-member-3",
  }),
  task({
    id: "demo-8",
    title: "Set up staging environment",
    status: "done",
    priority: "medium",
    tags: ["infra"],
    assignee_id: "demo-member-1",
  }),
  task({
    id: "demo-9",
    title: "Ship the new invite flow",
    status: "done",
    priority: "critical",
    tags: ["release"],
    assignee_id: "demo-member-2",
  }),
];

export const DEMO_COLUMNS = BOARD_COLUMNS;
