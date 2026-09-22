# Project AI Chat Tool Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the floating project AI chat widget actually execute real changes (create/edit tasks, change status, comment, read context, record attempts) through the same session-authorized Server Actions the UI itself uses, with task deletion requiring an explicit human confirm click, replacing the currently-broken stdio MCP spawn.

**Architecture:** A new dispatcher module (`src/lib/ai/chat-tools.ts`) exposes a JSON-schema tool list and a `runChatTool()` function that calls existing session-based Server Actions (`createTask`, `updateTask`, `postComment`, `loadAttempts`, `createAttempt`, `getTaskAgentContext`) — no new authorization layer, same `canWriteProject`/`canManageProject` checks the UI already goes through. `POST /api/ai/chat` runs a bounded tool-call loop against this dispatcher instead of the old stdio MCP client. `propose_delete_task` never deletes; a new `POST /api/ai/chat/confirm-delete` route does the actual delete, called only from a confirm button in the chat UI.

**Tech Stack:** Next.js route handlers, existing `AIProvider.complete()` tool-calling (already implemented in `src/lib/ai/providers/{anthropic,openai-compatible}.ts`), existing Server Actions.

This repo has no component/unit test runner (per `CLAUDE.md`) — verification is `tsc` + `lint` + `build` plus scratch scripts against the PGlite harness already used elsewhere in this session, not a Jest/Vitest suite. Task steps below say so explicitly instead of pretending otherwise.

---

### Task 1: Tool dispatcher (`src/lib/ai/chat-tools.ts`)

**Files:**
- Create: `src/lib/ai/chat-tools.ts`

- [ ] **Step 1: Write the file**

```ts
import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import {
  createTask,
  updateTask,
  postComment,
  loadAttempts,
  createAttempt,
} from "@/app/projects/[id]/work/actions";
import { getTaskAgentContext } from "@/lib/context/agent-context";
import type { TaskPriority, TaskStatus } from "@/types/task";
import type { AttemptOutcome } from "@/types/task";

/**
 * Tool list passed to AIProvider.complete({ tools }). Plain JSON Schema,
 * matching AICompletionInput["tools"]'s shape (src/lib/ai/provider.ts) -
 * not the zod schemas src/lib/mcp/http/tools.ts uses, since that's a
 * different SDK (the MCP protocol) with a different caller (Claude Code,
 * authenticated by API key). This chat has a logged-in browser session
 * instead, so its tools dispatch to the same Server Actions the UI itself
 * calls (see runChatTool below) - same permission checks, no API key
 * involved, no separate "AI agent" permission layer.
 *
 * "delete" is deliberately not a tool name here - see propose_delete_task's
 * own comment for why, and why its handler never actually deletes anything.
 */
export const CHAT_TOOLS = [
  {
    name: "create_task",
    description: "Create a new task in this project. Lands in the Backlog column unless a status is given.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "Longer description, markdown allowed" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "review", "done"] },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Edit an existing task's title, description, priority or due date. Does not change status - use set_task_status for that.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        due_date: { type: "string", description: "YYYY-MM-DD, or empty string to clear it" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "set_task_status",
    description: "Move a task to a different board column.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "review", "done"] },
      },
      required: ["task_id", "status"],
    },
  },
  {
    name: "comment_on_task",
    description: "Add a comment to a task.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["task_id", "content"],
    },
  },
  {
    name: "get_task_context",
    description: "Read a task's full context: description, project memory, related decisions, previous attempts.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "list_attempts",
    description: "List previously recorded attempts (what was tried, what happened) for a task.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "record_attempt",
    description: "Record an attempt at a task: what was tried and what happened. Use after doing real work on a task, not for planning.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        problem: { type: "string" },
        approach: { type: "string" },
        outcome: { type: "string", enum: ["failed", "partial", "succeeded"] },
        result: { type: "string" },
        failure_reason: { type: "string" },
        files_changed: { type: "string", description: "One file path per line" },
        related_pr_url: { type: "string" },
      },
      required: ["task_id", "problem", "approach", "outcome"],
    },
  },
  {
    name: "propose_delete_task",
    description: "Propose deleting a task. This never deletes anything by itself - it only shows the user a confirm button. Only call this when the user explicitly asked to delete something.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
] as const;

export interface ChatToolResult {
  ok: boolean;
  summary: string;
  pendingDelete?: { taskId: string; title: string };
}

/** MAX(sort_order) + 100 for a column, so a chat-created task lands after every existing card in it - same spacing CreateTaskDialog uses (work-board.tsx). */
async function nextSortOrder(userId: string, projectId: string, status: TaskStatus): Promise<number> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT COALESCE(MAX(sort_order), 0) AS max FROM tasks WHERE project_id = $1 AND status = $2", [
        projectId,
        status,
      ])
    );
    return Number(result.rows[0]?.max ?? 0) + 100;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 100;
}

/** Task title for a propose_delete_task confirmation prompt - project-scoped, so a task_id from another project never leaks a title into this chat. */
async function taskTitleInProject(userId: string, projectId: string, taskId: string): Promise<string | null> {
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query("SELECT title FROM tasks WHERE id = $1 AND project_id = $2", [taskId, projectId])
    );
    return (result.rows[0]?.title as string | undefined) ?? null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("title")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data?.title ?? null;
}

export async function runChatTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string,
  userId: string
): Promise<ChatToolResult> {
  const str = (key: string): string => (typeof args[key] === "string" ? (args[key] as string) : "");

  switch (name) {
    case "create_task": {
      const title = str("title");
      if (!title.trim()) return { ok: false, summary: "create_task needs a title." };
      const status = (str("status") || "backlog") as TaskStatus;
      const sortOrder = await nextSortOrder(userId, projectId, status);
      const result = await createTask(projectId, {
        title,
        description: str("description"),
        status,
        priority: (str("priority") || "medium") as TaskPriority,
        assigneeId: "",
        dueDate: "",
        sortOrder,
      });
      if (result.error || !result.task) return { ok: false, summary: `Could not create task: ${result.error}` };
      return { ok: true, summary: `Created task: ${result.task.title}` };
    }

    case "update_task": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "update_task needs a task_id." };
      const patch: Record<string, unknown> = {};
      if (typeof args.title === "string") patch.title = args.title;
      if (typeof args.description === "string") patch.description = args.description;
      if (typeof args.priority === "string") patch.priority = args.priority;
      if (typeof args.due_date === "string") patch.due_date = args.due_date || null;
      const result = await updateTask(projectId, taskId, patch as Parameters<typeof updateTask>[2]);
      if (result.error || !result.task) return { ok: false, summary: `Could not update task: ${result.error}` };
      return { ok: true, summary: `Updated task: ${result.task.title}` };
    }

    case "set_task_status": {
      const taskId = str("task_id");
      const status = str("status") as TaskStatus;
      if (!taskId || !status) return { ok: false, summary: "set_task_status needs a task_id and status." };
      const result = await updateTask(projectId, taskId, { status } as Parameters<typeof updateTask>[2]);
      if (result.error || !result.task) return { ok: false, summary: `Could not change status: ${result.error}` };
      return { ok: true, summary: `Moved "${result.task.title}" to ${status}` };
    }

    case "comment_on_task": {
      const taskId = str("task_id");
      const content = str("content");
      if (!taskId || !content.trim()) return { ok: false, summary: "comment_on_task needs a task_id and content." };
      const result = await postComment(projectId, taskId, content);
      if (result.error || !result.comment) return { ok: false, summary: `Could not add comment: ${result.error}` };
      return { ok: true, summary: "Added a comment" };
    }

    case "get_task_context": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "get_task_context needs a task_id." };
      const result = await getTaskAgentContext(projectId, taskId);
      if (result.error) return { ok: false, summary: `Could not read task context: ${result.error}` };
      return { ok: true, summary: result.markdown };
    }

    case "list_attempts": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "list_attempts needs a task_id." };
      const result = await loadAttempts(projectId, taskId);
      if (result.error) return { ok: false, summary: `Could not load attempts: ${result.error}` };
      if (result.attempts.length === 0) return { ok: true, summary: "No attempts recorded yet." };
      return {
        ok: true,
        summary: result.attempts
          .map((a) => `[${a.outcome}] ${a.problem} -> ${a.approach}`)
          .join("\n"),
      };
    }

    case "record_attempt": {
      const taskId = str("task_id");
      const problem = str("problem");
      const approach = str("approach");
      const outcome = str("outcome") as AttemptOutcome;
      if (!taskId || !problem.trim() || !approach.trim() || !outcome) {
        return { ok: false, summary: "record_attempt needs task_id, problem, approach and outcome." };
      }
      const result = await createAttempt(projectId, {
        task_id: taskId,
        problem,
        approach,
        outcome,
        result: str("result"),
        failure_reason: str("failure_reason"),
        files_changed: str("files_changed"),
        related_pr_url: str("related_pr_url"),
        agent: "Guidon AI Assistant",
      });
      if (result.error || !result.attempt) return { ok: false, summary: `Could not record attempt: ${result.error}` };
      return { ok: true, summary: "Recorded attempt" };
    }

    case "propose_delete_task": {
      const taskId = str("task_id");
      if (!taskId) return { ok: false, summary: "propose_delete_task needs a task_id." };
      const title = await taskTitleInProject(userId, projectId, taskId);
      if (!title) return { ok: false, summary: "That task was not found in this project." };
      return { ok: true, summary: `Proposed deleting: ${title}`, pendingDelete: { taskId, title } };
    }

    default:
      return { ok: false, summary: `Unknown tool: ${name}` };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify against the PGlite harness**

There is no `.env.local`, so this can't run against a real dev server directly, but the app can run self-hosted against PGlite the same way earlier verification in this session did (`node pglite-server3.mjs` behind a TCP forwarder + `next start` with `DATABASE_URL` pointing at it — grep this session's own scratchpad if a harness script already exists; if not, build one following the same shape: PGlite + `db.execProtocolRaw` behind a raw TCP listener on 127.0.0.1:5999, seeded with a user/org/project/task, `next build` then `node .next/standalone/server.js` with `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5999/postgres`). Through the running app, call the chat route (Task 2) once it exists rather than calling `runChatTool` directly (it needs a real session cookie, which the harness can mint the same way this session already did with `signSession`'s HMAC scheme). Defer full exercise to Task 2/5's verification once the route exists; for this task, confirm only that the module imports cleanly (`node -e "require('...')"` will not work directly since it's TS with path aliases - `tsc --noEmit` passing is the practical bar here).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/chat-tools.ts
git commit -m "Add session-based tool dispatcher for the project AI chat"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 2: Rewrite the chat route's tool loop, delete the old orchestrator

**Files:**
- Modify: `src/app/api/ai/chat/route.ts`
- Delete: `src/lib/ai/orchestrator.ts`

- [ ] **Step 1: Replace the whole file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { getProjectAccess } from "@/lib/data/project-access";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";
import { isChatRateLimited, recordChatMessage } from "@/lib/ai/chat-rate-limit";
import { CHAT_TOOLS, runChatTool } from "@/lib/ai/chat-tools";
import type { AIMessage } from "@/lib/ai/provider";

const MAX_TOOL_ITERATIONS = 5;

function buildSystemPrompt(projectName: string): string {
  return (
    `You are the Guidon AI Assistant for the project "${projectName}". ` +
    `You can create tasks, edit them, change their status, comment on them, ` +
    `read a task's full context, and record/list attempts, using the tools ` +
    `available to you. Deleting a task only ever proposes the deletion - ` +
    `the user must click a confirm button themselves, so call ` +
    `propose_delete_task freely when asked to delete something; it is safe. ` +
    `Be concise. After using tools, summarize what you did in one or two ` +
    `sentences - the tool calls themselves are already shown to the user.`
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const incomingMessages = Array.isArray(body?.messages) ? body.messages : null;
  if (!projectId || !incomingMessages) {
    return NextResponse.json({ error: "projectId and messages are required" }, { status: 400 });
  }

  const access = await getProjectAccess(projectId);
  if (!access) {
    return NextResponse.json({ error: "No access to project" }, { status: 403 });
  }

  if (isChatRateLimited(access.userId, projectId)) {
    return NextResponse.json(
      { error: "You're sending messages too quickly - wait a few minutes and try again." },
      { status: 429 }
    );
  }
  recordChatMessage(access.userId, projectId);

  const provider = await resolveAIProvider(access.project.organization_id, access.userId);
  if (!provider) {
    return NextResponse.json({ error: "No AI provider is configured for this organization." }, { status: 400 });
  }

  const messages: AIMessage[] = incomingMessages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const actions: string[] = [];
  let pendingDelete: { taskId: string; title: string } | undefined;

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await provider.complete({
        system: buildSystemPrompt(access.project.name),
        messages,
        tools: CHAT_TOOLS as unknown as Array<{ name: string; description: string; input_schema: object }>,
        maxTokens: 1000,
      });

      if (!result.tool_calls || result.tool_calls.length === 0) {
        return NextResponse.json({ text: result.text, actions, pendingDelete });
      }

      messages.push({ role: "assistant", content: result.text, tool_calls: result.tool_calls });

      for (const call of result.tool_calls) {
        const toolResult = await runChatTool(call.name, call.args, projectId, access.userId);
        actions.push(toolResult.summary);
        messages.push({ role: "tool", content: toolResult.summary, tool_call_id: call.id });

        if (toolResult.pendingDelete) {
          pendingDelete = toolResult.pendingDelete;
          return NextResponse.json({ text: "", actions, pendingDelete });
        }
      }
    }

    return NextResponse.json({
      text: "I've made several changes - let me know if you'd like me to continue.",
      actions,
      pendingDelete,
    });
  } catch (error) {
    console.error("[AI Chat API Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Delete the old orchestrator**

```bash
rm src/lib/ai/orchestrator.ts
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `AIMessage`'s `tool_calls` field type doesn't accept what `result.tool_calls` returns, check `src/lib/ai/provider.ts`'s `AIMessage`/`AICompletionResult` interfaces (both already declare `tool_calls?: Array<{id, name, args}>`, so the shapes should already line up) - fix the mismatch rather than casting past it.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/chat/route.ts
git rm src/lib/ai/orchestrator.ts
git commit -m "Rewrite the project AI chat's tool loop on the session-based dispatcher"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 3: Delete-confirmation route

**Files:**
- Create: `src/app/api/ai/chat/confirm-delete/route.ts`

- [ ] **Step 1: Write the file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { deleteTask } from "@/app/projects/[id]/work/actions";

/**
 * The only place a task the AI chat proposed deleting actually gets
 * deleted - propose_delete_task (chat-tools.ts) never calls deleteTask
 * itself. No AI call happens here at all; this is a plain confirm click.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const taskId = typeof body?.taskId === "string" ? body.taskId : null;
  if (!projectId || !taskId) {
    return NextResponse.json({ error: "projectId and taskId are required" }, { status: 400 });
  }

  const result = await deleteTask(projectId, taskId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/chat/confirm-delete/route.ts
git commit -m "Add the AI chat's delete-confirmation route"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 4: i18n for the AI chat widget

**Files:**
- Modify: `messages/en.json`, `messages/pl.json`, `messages/de.json`, `messages/es.json`

- [ ] **Step 1: Add an `aiChat` namespace to all four files**

`AIChat.tsx` currently has zero translated strings, unlike the rest of the app. Add this top-level namespace with identical keys in all four files (values below are the four languages' text):

```json
"aiChat": {
  "title": {
    "en": "Guidon AI Assistant",
    "pl": "Asystent AI Guidona",
    "de": "Guidon-KI-Assistent",
    "es": "Asistente de IA de Guidon"
  },
  "emptyTitle": {
    "en": "How can I help you with this project?",
    "pl": "Jak mogę pomóc w tym projekcie?",
    "de": "Wie kann ich bei diesem Projekt helfen?",
    "es": "¿Cómo puedo ayudarte con este proyecto?"
  },
  "emptyHint": {
    "en": "I can create and update tasks, comment, and answer questions.",
    "pl": "Mogę tworzyć i edytować zadania, komentować i odpowiadać na pytania.",
    "de": "Ich kann Aufgaben erstellen und bearbeiten, kommentieren und Fragen beantworten.",
    "es": "Puedo crear y editar tareas, comentar y responder preguntas."
  },
  "placeholder": {
    "en": "Ask AI to do something...",
    "pl": "Poproś AI o coś...",
    "de": "Bitte die KI um etwas...",
    "es": "Pide algo a la IA..."
  },
  "thinking": {
    "en": "Thinking...",
    "pl": "Myślę...",
    "de": "Denke nach...",
    "es": "Pensando..."
  },
  "confirmDelete": {
    "en": "Confirm delete",
    "pl": "Potwierdź usunięcie",
    "de": "Löschen bestätigen",
    "es": "Confirmar eliminación"
  },
  "cancel": {
    "en": "Cancel",
    "pl": "Anuluj",
    "de": "Abbrechen",
    "es": "Cancelar"
  },
  "deletePrompt": {
    "en": "Delete task \"{title}\"?",
    "pl": "Usunąć zadanie \"{title}\"?",
    "de": "Aufgabe \"{title}\" löschen?",
    "es": "¿Eliminar la tarea \"{title}\"?"
  },
  "deletedConfirmation": {
    "en": "Deleted task: {title}",
    "pl": "Usunięto zadanie: {title}",
    "de": "Aufgabe gelöscht: {title}",
    "es": "Tarea eliminada: {title}"
  },
  "deleteFailed": {
    "en": "Could not delete the task.",
    "pl": "Nie udało się usunąć zadania.",
    "de": "Die Aufgabe konnte nicht gelöscht werden.",
    "es": "No se pudo eliminar la tarea."
  },
  "errorGeneric": {
    "en": "Sorry, I encountered an error. Please try again.",
    "pl": "Przepraszam, wystąpił błąd. Spróbuj ponownie.",
    "de": "Entschuldigung, es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
    "es": "Lo siento, ocurrió un error. Inténtalo de nuevo."
  }
}
```

The table above lists all four languages together for readability; each `messages/<lang>.json` file gets only its own language's flat strings (e.g. `messages/pl.json` gets `"aiChat": { "title": "Asystent AI Guidona", "emptyTitle": "Jak mogę pomóc w tym projekcie?", ... }` - a normal flat object like every other namespace in these files, not the nested `{en, pl, de, es}` shape shown above, which is only this plan's way of listing all four translations together).

- [ ] **Step 2: Verify the four files have identical key sets**

Run:
```bash
node -e "
const fs = require('fs');
const sets = ['en','pl','de','es'].map(l => Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json','utf8')).aiChat).sort().join());
console.log('identical:', sets.every(s => s === sets[0]));
"
```
Expected: `identical: true`

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/pl.json messages/de.json messages/es.json
git commit -m "Add aiChat translations for the project AI chat widget"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 5: Rewrite `AIChat.tsx`, delete the dead stdio MCP files, final verification

**Files:**
- Modify: `src/components/ai/AIChat.tsx`
- Delete: `src/lib/mcp/server.ts`, `src/lib/mcp/client.ts`

- [ ] **Step 1: Replace the whole component**

```tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bot, Check, Loader2, Send, Sparkles, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  pendingDelete?: { taskId: string; title: string };
}

export function AIChat({ projectId }: { projectId: string }) {
  const t = useTranslations("aiChat");
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.text || "",
          actions: data.actions?.length ? data.actions : undefined,
          pendingDelete: data.pendingDelete,
        },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("errorGeneric") }]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmDelete(taskId: string, title: string) {
    setConfirmingDelete(true);
    try {
      const res = await fetch("/api/ai/chat/confirm-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskId }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.ok ? t("deletedConfirmation", { title }) : data.error || t("deleteFailed"),
        },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("deleteFailed") }]);
    } finally {
      setConfirmingDelete(false);
    }
  }

  function handleCancelDelete() {
    setMessages((prev) => prev.map((m) => (m.pendingDelete ? { ...m, pendingDelete: undefined } : m)));
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50" onClick={() => setIsOpen(true)}>
        <Button size="icon" className="rounded-full h-12 w-12 shadow-lg hover:scale-110 transition-transform">
          <Sparkles className="h-6 w-6" />
        </Button>
      </div>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {t("title")}
            </SheetTitle>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground mt-10 space-y-2">
                <Bot className="h-10 w-10 mx-auto opacity-20" />
                <p>{t("emptyTitle")}</p>
                <p className="text-xs">{t("emptyHint")}</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className="max-w-[80%] space-y-1.5">
                  {m.actions?.map((action, actionIndex) => (
                    <div key={actionIndex} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 shrink-0 text-success" aria-hidden />
                      {action}
                    </div>
                  ))}
                  {m.content && (
                    <div
                      className={cn(
                        "p-3 rounded-lg text-sm",
                        m.role === "user" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"
                      )}
                    >
                      {m.content}
                    </div>
                  )}
                  {m.pendingDelete && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs">
                      <span className="flex-1">{t("deletePrompt", { title: m.pendingDelete.title })}</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2"
                        disabled={confirmingDelete}
                        onClick={() => m.pendingDelete && handleConfirmDelete(m.pendingDelete.taskId, m.pendingDelete.title)}
                      >
                        {confirmingDelete ? <Loader2 className="h-3 w-3 animate-spin" /> : t("confirmDelete")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleCancelDelete}>
                        <X className="h-3 w-3" />
                        {t("cancel")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="bg-muted p-3 rounded-lg text-sm italic text-muted-foreground">{t("thinking")}</div>
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-background">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("placeholder")}
                className="min-h-0 h-10 resize-none py-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button type="submit" disabled={isLoading} size="icon" className="h-10 w-10 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Delete the dead stdio MCP files**

```bash
rm src/lib/mcp/server.ts src/lib/mcp/client.ts
```

Confirm nothing else references them first:
```bash
grep -rln "lib/mcp/server\|lib/mcp/client\|mcpClient\|guidonMCPServer" src --include=*.ts --include=*.tsx
```
Expected: no output (or only comments mentioning the path in `src/app/api/mcp/route.ts`, which is fine - that's prose, not an import).

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: problem count does not exceed this session's last known baseline (24); none in the files this plan touched.

Run: `npm run test:db`
Expected: same pass count as before this plan (this plan makes no schema change) - `183 pass / 0 fail` as of this plan's writing, but treat the actual pre-existing count as the baseline, not this specific number, in case other work landed first.

Run: `npm run build`
Expected: builds cleanly; `/api/ai/chat` and `/api/ai/chat/confirm-delete` both listed as routes.

- [ ] **Step 4: Verify against the PGlite harness in a real browser**

No `.env.local`, so a real Anthropic/OpenAI HTTP call cannot be exercised - say so explicitly in the final report rather than claiming it was tested. What CAN be verified end to end without a live provider key: seed a project with `organization_ai_settings` pointing at a fake/invalid key (or skip provider resolution entirely and directly unit-check `runChatTool` per tool name against the PGlite harness with a scratch script, asserting the right Server Action ran, e.g. a task row actually appears after `create_task`, and that `propose_delete_task` returns `pendingDelete` without the task row disappearing). Also click through the widget in the browser far enough to confirm: it opens, renders the empty state via `t("emptyTitle")` (proving the new i18n keys resolve), and a message send reaches `/api/ai/chat` (a 400 "No AI provider configured" response is an acceptable, honest verification result here if no real key is available - it proves the route, auth and rate-limit path all work up to the provider call).

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/AIChat.tsx
git rm src/lib/mcp/server.ts src/lib/mcp/client.ts
git commit -m "Rewrite AIChat.tsx with action lines, delete confirmation and i18n; remove dead stdio MCP code"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Self-Review

**Spec coverage:** dispatcher + tool list (Task 1) ✓, rewritten route with bounded loop + rate limiting (Task 2) ✓, confirm-delete route (Task 3) ✓, AIChat.tsx action lines + delete confirm UI + i18n (Task 4, 5) ✓, dead code removal (Task 5) ✓. `propose_delete_task` never calling `deleteTask` ✓ (Task 1's handler only reads the title).

**Type consistency:** `runChatTool`'s `ChatToolResult` (Task 1) matches exactly what `route.ts` (Task 2) destructures (`ok`/`summary`/`pendingDelete`). `AIChat.tsx`'s `Message.pendingDelete` shape (`{taskId, title}`) matches `ChatToolResult.pendingDelete` and the route's JSON response field name. Tool names in `CHAT_TOOLS` (Task 1) match the `switch` cases in `runChatTool` exactly (8 tools, 8 cases plus `default`).

**Placeholder scan:** none - every step has real code or an exact command.
