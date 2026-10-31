import "server-only";

import { getAIProvider } from "@/lib/ai/provider";
import { parseTaskProposals, type TaskProposal } from "@/lib/ai/task-proposal-parser";
import { getOptionalCurrentUser } from "@/lib/data/current-user";
import { getProjectAccess } from "@/lib/data/project-access";
import { timeAction } from "@/lib/perf/action-timing";
import { randomUUID } from "node:crypto";
import { getElements, upsertElement, deleteElements, getEdges, upsertEdge, deleteEdges } from "@/lib/data/whiteboard";
import type { WhiteboardElement, WhiteboardEdge } from "@/lib/data/whiteboard";
import type { ProjectId } from "@/types/index";

export async function generateTaskProposals(projectId: string, selectedTexts: string[]) {
  const user = await getOptionalCurrentUser();
  if (!user) throw new Error("Authentication required");

  const access = await getProjectAccess(projectId);
  if (!access) throw new Error("Project not found");

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
        distinctId: user.id,
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

export async function getElementsAction(projectId: string, boardId: string = "default") {
  try {
    return await getElements(boardId, projectId);
  } catch (e) {
    console.error("Error fetching elements:", e);
    throw e;
  }
}

export async function upsertElementAction(projectId: string, element: Partial<WhiteboardElement>) {
  try {
    return await upsertElement(projectId, element);
  } catch (e) {
    console.error("Error upserting element:", e);
    throw e;
  }
}

export async function deleteElementsAction(projectId: string, ids: string[]) {
  try {
    return await deleteElements(projectId, ids);
  } catch (e) {
    console.error("Error deleting elements:", e);
    throw e;
  }
}

export async function getEdgesAction(projectId: string, boardId: string = "default") {
  try {
    return await getEdges(boardId, projectId);
  } catch (e) {
    console.error("Error fetching edges:", e);
    throw e;
  }
}

export async function upsertEdgeAction(projectId: string, edge: Partial<WhiteboardEdge>) {
  try {
    return await upsertEdge(projectId, edge);
  } catch (e) {
    console.error("Error upserting edge:", e);
    throw e;
  }
}

export async function deleteEdgesAction(projectId: string, ids: string[]) {
  try {
    return await deleteEdges(projectId, ids);
  } catch (e) {
    console.error("Error deleting edges:", e);
    throw e;
  }
}
