"use server";

import { getAIProvider } from "@/lib/ai/provider";
import { parseTaskProposals, type TaskProposal } from "@/lib/ai/task-proposal-parser";
import { getOptionalCurrentUser } from "@/lib/data/current-user";
import { getProjectContext } from "@/lib/data/project-access";
import { timeAction } from "@/lib/perf/action-timing";
import { randomUUID } from "node:crypto";

export async function generateTaskProposals(projectId: string, selectedTexts: string[]) {
  const user = await getOptionalCurrentUser();
  if (!user) throw new Error("Authentication required");

  const project = await getProjectContext(projectId);
  if (!project) throw new Error("Project not found");

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
