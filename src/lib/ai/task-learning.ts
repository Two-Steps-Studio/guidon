import "server-only";

import { after } from "next/server";
import { serviceDataClient } from "@/lib/data-client";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";
import { createRateLimitWindow } from "@/lib/ai/rate-limit-window";
import { normalizeDisabledModules } from "@/lib/work/project-modules";
import { languageName, normalizeProjectLanguage } from "@/lib/project-language";
import { newFacts, parseLearnedFacts, taskHasSubstance, type LearnedFact } from "@/lib/ai/task-learning-core";

/**
 * "Learn from finished work": when a task is completed - on the board, in
 * bulk, through the API or by an agent (emitTaskEvent's `completed`) - an AI
 * reads the task with its comments and attempts and proposes the one or two
 * things worth remembering for future work. They land in Memory as
 * unverified AI insights (the existing Accept / Correct / Reject queue),
 * linked to the task, so nothing becomes project knowledge without a
 * person. Verified ones then feed every later AI conversation and agent
 * context - the board teaches the project's memory instead of someone
 * having to fill it in by hand.
 *
 * Runs after the response (after()), never fails the completion, and stays
 * quiet when it can't help: AI off for the project or the Memory module
 * hidden, no provider, a task with too little written about it, a task it
 * already learned from, or the per-project hourly cap reached.
 *
 * The finished task is the evidence: if it's reopened or deleted, the
 * insights still waiting for review are withdrawn (migration 098), and a
 * later completion learns again. Accepted ones stay.
 *
 * The service client is deliberate: this runs for whoever completed the
 * task - a browser session, an API key, a Discord user - after the request,
 * where not every mode still has that caller's RLS session. Everything read
 * or written is scoped to the one project and task the caller just changed.
 */

const perProject = createRateLimitWindow(20, 60 * 60 * 1000);

export function learnFromCompletedTask(projectId: string, userId: string, taskId: string): void {
  after(async () => {
    try {
      await learn(projectId, userId, taskId);
    } catch (error) {
      console.error("[task-learning] skipped:", error instanceof Error ? error.message : error);
    }
  });
}

interface ProjectRow {
  organization_id: string;
  ai_enabled: boolean;
  disabled_modules: string[] | null;
  /** Migration 070 - absent before it. */
  language?: string | null;
}

async function learn(projectId: string, userId: string, taskId: string): Promise<void> {
  if (perProject.isLimited(projectId)) return;
  const db = serviceDataClient();

  const { data: project } = await db
    .from<ProjectRow>("projects")
    // "*": language (070) may not exist yet.
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.ai_enabled || normalizeDisabledModules(project.disabled_modules).includes("memory")) return;

  // Once per task: a reopened-and-finished-again task isn't relearned.
  const { data: already } = await db
    .from<{ id: string }>("context_relations")
    .select("id")
    .eq("project_id", projectId)
    .eq("source_type", "memory")
    .eq("target_type", "task")
    .eq("target_id", taskId)
    .eq("relation_type", "based_on")
    .limit(1);
  if (already.length) return;

  const [{ data: task }, { data: comments }, { data: attempts }, { data: memory }] = await Promise.all([
    db
      .from<{ title: string; description: string | null; is_done: boolean }>("tasks")
      .select("title, description, is_done")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .maybeSingle(),
    db
      .from<{ content: string }>("task_comments")
      .select("content")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
      .limit(30),
    db
      .from<{ problem: string | null; approach: string | null; outcome: string; result: string | null; failure_reason: string | null }>(
        "task_attempts"
      )
      .select("problem, approach, outcome, result, failure_reason")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
      .limit(10),
    db
      .from<{ content: string }>("project_memory")
      .select("content")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      // The newest 40 go into the prompt; all of these are checked for repeats.
      .limit(300),
  ]);
  // Reopened in the meantime, or gone.
  if (!task?.is_done) return;

  const material = {
    title: task.title,
    description: task.description ?? "",
    comments: comments.map((c) => c.content),
    attempts: attempts.map((a) =>
      [a.problem && `Problem: ${a.problem}`, a.approach && `Approach: ${a.approach}`, `Outcome: ${a.outcome}`, a.result && `Result: ${a.result}`, a.failure_reason && `Why it failed: ${a.failure_reason}`]
        .filter(Boolean)
        .join("; ")
    ),
  };
  if (!taskHasSubstance(material)) return;

  const provider = await resolveAIProvider(project.organization_id, userId);
  if (!provider) return;
  perProject.record(projectId);

  const prompt = [
    `Finished task: ${material.title}`,
    material.description && `Description:\n${material.description.slice(0, 4000)}`,
    material.comments.length && `Comments:\n${material.comments.map((c) => `- ${c.slice(0, 800)}`).join("\n")}`,
    material.attempts.length && `Attempts:\n${material.attempts.map((a) => `- ${a.slice(0, 800)}`).join("\n")}`,
    memory.length && `Already in the project's memory (don't repeat these):\n${memory.slice(0, 40).map((m) => `- ${m.content.slice(0, 200)}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await provider.complete({
    system:
      "You keep a software/game project's long-term memory. From a task that was just finished, extract at most TWO " +
      "durable things future work on this project should know: a fact about the codebase or game, a rule or convention, " +
      "a constraint, or a decision and its reason. Skip anything only about this task's progress, anything obvious or " +
      "generic, and anything already in memory. Each one sentence, specific, written in " +
        (normalizeProjectLanguage(project.language) ? languageName(normalizeProjectLanguage(project.language)!) : "the language the task is written in") +
        ". " +
      'Answer with JSON only: [{"type":"fact|project_rule|constraint|decision_summary","content":"..."}] - or [] if nothing qualifies.',
    messages: [{ role: "user", content: prompt }],
    maxTokens: 400,
  });

  // The prompt asks for nothing already known, but models repeat anyway:
  // anything memory (or this answer) already says is dropped here.
  const facts: LearnedFact[] = newFacts(parseLearnedFacts(result.text), memory.map((m) => m.content));
  for (const fact of facts) {
    // An unverified ai_insight: the Memory page's review queue. The kind the
    // model suggested is kept in the text, the reviewer picks it on accept.
    const { data: created, error } = await db
      .from<{ id: string }>("project_memory")
      .insert({
        project_id: projectId,
        content: `${fact.content} (${fact.type.replace("_", " ")}, from "${task.title.slice(0, 120)}")`,
        memory_type: "ai_insight",
        verified: false,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !created) continue;
    await db.from("context_relations").insert({
      source_type: "memory",
      source_id: created.id,
      target_type: "task",
      target_id: taskId,
      relation_type: "based_on",
      created_by: userId,
      metadata: { origin: "task_learning" },
    });
  }
}
