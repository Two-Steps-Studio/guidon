"use server";

import { parseTaskProposals, type TaskProposal } from "@/lib/ai/task-proposal-parser";
import { timeAction } from "@/lib/perf/action-timing";
import { randomUUID } from "node:crypto";
import type { ProjectId } from "@/types/index";

/**
 * Server Actions for the Whiteboard module.
 * All server-side dependencies are dynamically imported to prevent
 * bundling into client components.
 */

/**
 * Wspólna walidacja dla akcji tablicy: tożsamość (getOptionalCurrentUser)
 * i dostęp do projektu (RLS to prawdziwa bariera; access daje userId do
 * dalszych zapytań i sam projekt).
 */
async function requireProject(projectId: string) {
  const { getOptionalCurrentUser } = await import("@/lib/data/current-user");
  const { getProjectAccess } = await import("@/lib/data/project-access");

  const user = await getOptionalCurrentUser();
  if (!user) throw new Error("Authentication required");

  const access = await getProjectAccess(projectId);
  if (!access) throw new Error("Project not found");

  return { userId: user.id, access };
}

export async function generateTaskProposals(projectId: string, selectedTexts: string[]) {
  const { userId, access } = await requireProject(projectId);
  const { getAIProvider } = await import("@/lib/ai/provider");

  const project = access.project;
  const provider = await getAIProvider();

  const systemPrompt = `
You are a project management expert helping a team convert brainstorming notes from a whiteboard into structured tasks.
Project: ${project.name}
Project Description: ${project.description ?? "No description provided."}

Instructions:
1. Analyze the provided whiteboard notes.
2. Identify distinct actionable tasks.
3. You may combine multiple related notes into one comprehensive task.
4. You may split a single complex note into multiple sub-tasks.
5. For each proposed task, provide:
   - A concise, action-oriented title.
   - A detailed description explaining the "what" and "why".
   - A priority: "low", "medium", or "high".
6. End your reply with a JSON block containing an array of task proposals.

JSON Format:
\`\`\`json
[
  {
    "title": "Example Task Title",
    "description": "Detailed explanation of the task...",
    "priority": "medium"
  }
]
\`\`\`
`;

  const userPrompt = `Convert these whiteboard notes into tasks:\n\n${selectedTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

  const result = await timeAction("whiteboard.ai.generate-proposals", async () => {
    return await provider.complete({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      observability: {
        sessionId: "whiteboard-session",
        traceId: randomUUID(),
        distinctId: userId,
        spanName: "whiteboard-convert-to-tasks",
      },
    });
  });

  const parsed = parseTaskProposals(result.text);
  return {
    prose: parsed.prose,
    proposals: parsed.proposals,
  };
}

/**
 * Rozstrzyga tablicę projektu: istniejący board (pierwszy wg created_at)
 * albo nowo utworzona „Główna tablica". board_id KOLUMNY whiteboard_elements
 * to UUID z tabeli whiteboards - napis "default" nie przechodzi FK, więc
 * każdy element/edge zapisujemy na prawdziwym boardzie.
 */
export async function getBoardAction(projectId: string) {
  const { userId } = await requireProject(projectId);
  const { getWhiteboards, createWhiteboard } = await import("@/lib/data/whiteboard");
  const { getLocale, getTranslations } = await import("next-intl/server");

  const boards = await getWhiteboards(userId, projectId);
  const existing = boards.data?.[0];
  if (existing) return { boardId: existing.id as string, name: existing.name as string };

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "whiteboard" });
  const created = await createWhiteboard(userId, projectId, t("boardDefaultName"));
  if (!created) throw new Error("Failed to create the project board");
  return { boardId: created.id as string, name: created.name as string };
}

export async function getElementsAction(projectId: string, boardId: string) {
  const { userId } = await requireProject(projectId);
  const { getElements } = await import("@/lib/data/whiteboard");
  return await getElements(userId, boardId, projectId);
}

export async function upsertElementAction(projectId: string, element: any) {
  const { userId } = await requireProject(projectId);
  const { upsertElement } = await import("@/lib/data/whiteboard");
  return await upsertElement(userId, projectId, element);
}

export async function deleteElementsAction(projectId: string, ids: string[]) {
  const { userId } = await requireProject(projectId);
  const { deleteElements } = await import("@/lib/data/whiteboard");
  return await deleteElements(userId, projectId, ids);
}

export async function getEdgesAction(projectId: string, boardId: string) {
  const { userId } = await requireProject(projectId);
  const { getEdges } = await import("@/lib/data/whiteboard");
  return await getEdges(userId, boardId, projectId);
}

export async function upsertEdgeAction(projectId: string, edge: any) {
  const { userId } = await requireProject(projectId);
  const { upsertEdge } = await import("@/lib/data/whiteboard");
  return await upsertEdge(userId, projectId, edge);
}

export async function deleteEdgesAction(projectId: string, ids: string[]) {
  const { userId } = await requireProject(projectId);
  const { deleteEdges } = await import("@/lib/data/whiteboard");
  return await deleteEdges(userId, projectId, ids);
}

/** Wszystkie zadania projektu na tablicę (przycisk „Pokaż zadania"). */
export async function getTasksForBoardAction(projectId: string) {
  const { userId, access } = await requireProject(projectId);
  const ROWS = 500;
  const { data, error } = await (await import("@/lib/data-client")).dataClient(userId)
    .from("tasks")
    .select("id, title, status, priority, is_done, due_date")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .limit(ROWS);

  if (error) throw new Error(`Failed to load tasks: ${error.message}`);
  return data;
}
