import "server-only";

import { randomBytes } from "node:crypto";
import type { DataClient } from "@/lib/data-client";

/**
 * The caller's sandbox (migration 075): an organization of their own,
 * flagged is_sandbox, with one project of example tasks - somewhere to try
 * the API, the MCP server or an agent without touching real work. Created
 * through the caller's own client, so RLS, triggers (owner membership,
 * subscription) and plan limits apply exactly as anywhere else.
 */

export interface Sandbox {
  organization_id: string;
  project_id: string;
  created: boolean;
  reset: boolean;
}

const EXAMPLE_TASKS: { title: string; description: string; status: string; priority: string }[] = [
  { title: "Read me first: this is your sandbox", description: "Everything here is test data. Create, move, comment and delete freely - POST /api/v1/sandbox with {\"reset\": true} puts it back as it was.", status: "todo", priority: "high" },
  { title: "Add a dark mode toggle", description: "Settings page: a switch that remembers the choice.", status: "todo", priority: "medium" },
  { title: "Fix the login timeout on slow networks", description: "Users on 3G get logged out after 10s. Raise the timeout and show a retry.", status: "backlog", priority: "high" },
  { title: "Write the onboarding email", description: "Three short paragraphs: what the product does, the first step, where to get help.", status: "backlog", priority: "low" },
  { title: "Profile page shows the wrong avatar", description: "After changing the avatar the old one is cached for an hour.", status: "in_progress", priority: "medium" },
  { title: "Set up error monitoring", description: "Send unhandled errors to the monitoring service with the release version.", status: "review", priority: "medium" },
];

async function seedProject(db: DataClient, organizationId: string): Promise<string> {
  const { data: project, error } = await db
    .from<{ id: string }>("projects")
    .insert({
      organization_id: organizationId,
      name: "Sandbox project",
      slug: `sandbox-${randomBytes(4).toString("hex")}`,
      description: "Test data for trying Guidon's API, MCP server and agents. Safe to change or reset.",
    })
    .select("id")
    .single();
  if (error || !project) throw new Error(`Could not create the sandbox project: ${error?.message}`);
  const { error: tasksError } = await db
    .from("tasks")
    .insert(EXAMPLE_TASKS.map((task, index) => ({ ...task, project_id: project.id, sort_order: (index + 1) * 1000 })));
  if (tasksError) throw new Error(`Could not add the example tasks: ${tasksError.message}`);
  return project.id;
}

/** The caller's sandbox, without creating anything; null when there is none yet. */
export async function findSandbox(db: DataClient, userId: string): Promise<{ organization_id: string; project_id: string | null } | null> {
  const { data: org } = await db
    .from<{ id: string }>("organizations")
    .select("id")
    .eq("created_by", userId)
    .eq("is_sandbox", true)
    .limit(1)
    .maybeSingle();
  if (!org) return null;
  const { data: project } = await db.from<{ id: string }>("projects").select("id").eq("organization_id", org.id).limit(1).maybeSingle();
  return { organization_id: org.id, project_id: project?.id ?? null };
}

/** Creates the sandbox if missing; with `reset`, replaces its project with fresh example data. */
export async function ensureSandbox(db: DataClient, userId: string, reset: boolean): Promise<Sandbox> {
  const existing = await findSandbox(db, userId);
  if (!existing) {
    const { data: org, error } = await db
      .from<{ id: string }>("organizations")
      .insert({
        name: "Sandbox",
        slug: `sandbox-${randomBytes(6).toString("hex")}`,
        description: "Your test organization for the Guidon API and agents.",
        created_by: userId,
        is_sandbox: true,
      })
      .select("id")
      .single();
    if (error || !org) throw new Error(`Could not create the sandbox: ${error?.message}`);
    return { organization_id: org.id, project_id: await seedProject(db, org.id), created: true, reset: false };
  }
  if (!reset && existing.project_id) {
    return { organization_id: existing.organization_id, project_id: existing.project_id, created: false, reset: false };
  }
  // Reset: the whole project goes (tasks, comments, knowledge... cascade) and comes back fresh.
  const { data: projects } = await db.from<{ id: string }>("projects").select("id").eq("organization_id", existing.organization_id);
  for (const project of projects ?? []) {
    await db.from("projects").delete().eq("id", project.id).eq("organization_id", existing.organization_id);
  }
  return { organization_id: existing.organization_id, project_id: await seedProject(db, existing.organization_id), created: false, reset: true };
}
