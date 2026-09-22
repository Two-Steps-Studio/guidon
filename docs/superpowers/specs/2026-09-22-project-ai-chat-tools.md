# Project AI chat: real tool execution

**Status:** approved by user (2026-09-22). Spec and task breakdown in one document.

## Problem

The floating AI chat widget (`src/components/ai/AIChat.tsx`, mounted on every project page via `src/app/projects/[id]/layout.tsx`) is completely non-functional in production. `POST /api/ai/chat` (`src/app/api/ai/chat/route.ts`) calls `aiOrchestrator.run()` (`src/lib/ai/orchestrator.ts`), which calls `mcpClient.connect("node", ["src/lib/mcp/server.ts"])` — spawning a child process to run a **TypeScript source file directly with plain `node`**. This fails immediately, and would still be architecturally wrong even if it somehow ran: spawning a persistent child process per chat request is not viable on Vercel's serverless functions.

This is a *different* mechanism from the already-working, deliberately tool-less AI task chat (`src/app/projects/[id]/work/ai-task-chat.tsx` + `ai-chat-actions.ts`), which has the model emit a JSON block of proposed tasks that a human clicks to accept — a considered safety choice made elsewhere in this codebase. The floating widget is meant to be a different, more capable assistant: one that actually executes changes.

## Decisions (from brainstorming)

- The chat gets **real tool execution** — create/edit tasks, change status, comment, read context and attempt history — not just proposals.
- `delete_task` is the one destructive tool: the model may **propose** a deletion, but it is never executed automatically. The chat shows a confirm button; only a human click deletes.
- Every executed tool call renders as one compact line in the transcript (e.g. "✓ Created task: Fix login bug") before the assistant's final text.

## Architecture

**No new authorization mechanism.** The chat has a logged-in browser session (`getCurrentUser()`), not an API key — so it does **not** go through `/api/v1` or the `/api/mcp` tool dispatch built for Claude Code (those are for API-key callers). Instead, a new dispatcher calls the **same session-based Server Actions the UI itself calls**, so the permission model is identical to clicking the buttons by hand (`canWriteProject`/`canManageProject` via `getProjectAccess`, RLS underneath) — no separate "AI agent" permission layer, because the acting principal is the human running the chat, not an external agent.

### `src/lib/ai/chat-tools.ts` (new)

- `CHAT_TOOLS: Array<{name, description, input_schema}>` — the JSON-schema tool list passed to `provider.complete({ tools })`. Covers: `create_task`, `update_task`, `set_task_status`, `comment_on_task`, `get_task_context`, `list_attempts`, `record_attempt`, `propose_delete_task`. (Named `propose_delete_task`, not `delete_task` — the name itself signals to the model, and to anyone reading a transcript, that this call never deletes anything by itself.)
- `runChatTool(name, args, projectId, userId): Promise<{ ok: boolean; summary: string; pendingDelete?: { taskId: string; title: string } }>` — the dispatcher. One `case` per tool name, each calling the matching Server Action:
  - `create_task` → `createTask` (`src/app/projects/[id]/work/actions.ts`). `sort_order` is not something the model should guess: the dispatcher computes it itself with a small dual-mode query, `SELECT COALESCE(MAX(sort_order), 0) + 100 FROM tasks WHERE project_id = $1 AND status = $2` (both `hasDirectDatabase()` branches, mirroring existing query patterns), before calling `createTask`.
  - `update_task` → `updateTask` (title/description/priority/due_date/tags — never `status`, that's `set_task_status`'s job, to keep the two tools' purposes unambiguous to the model).
  - `set_task_status` → `updateTask(projectId, taskId, { status })`. No separate "start"/"complete" tools — the model just picks the target status; `canWriteProject` already gates this exactly like dragging a card.
  - `comment_on_task` → `postComment`.
  - `get_task_context` → `getTaskAgentContext` (`src/lib/context/agent-context.ts`, already session-based).
  - `list_attempts` / `record_attempt` → `loadAttempts` / `createAttempt`.
  - `propose_delete_task` → does **not** call `deleteTask`. It calls `getTaskAgentContext`-adjacent lookup only far enough to confirm the task exists and get its title (a cheap `SELECT title FROM tasks WHERE id = $1 AND project_id = $2` under `withUser`/Supabase, both modes), then returns `{ ok: true, summary: "Proposed deleting: <title>", pendingDelete: { taskId, title } }`. The orchestration loop (below) stops after a `pendingDelete` shows up in a turn — it does not keep calling more tools that turn — and surfaces it to the client instead of looping again.

### `src/app/api/ai/chat/route.ts` (rewritten body, same request/response contract plus one new field)

- Keeps `getCurrentUser()` + `getProjectAccess()` + the existing 403 checks.
- Reuses `isChatRateLimited`/`recordChatMessage` from `src/lib/ai/chat-rate-limit.ts` (20 messages / 5 minutes per user+project) — the same budget the existing task chat already uses, and the same reasoning (every message is a billed LLM call).
- Replaces `aiOrchestrator.run(...)` with a new bounded loop (≤5 iterations, matching the old orchestrator's `MAX_ITERATIONS`) inline in the route (small enough not to need its own module):
  1. Call `provider.complete({ system, messages, tools: CHAT_TOOLS, maxTokens })` (`resolveAIProvider`, unchanged).
  2. No `tool_calls` → return `{ text: result.text, actions: actionsSoFar }`.
  3. Has `tool_calls` → for each, call `runChatTool`. If any result has `pendingDelete`, stop the loop immediately after that call and return `{ text: result.text, actions: actionsSoFar, pendingDelete }` (skip any further tool calls in that same batch — one proposed deletion per turn keeps the confirmation unambiguous). Otherwise append a `{role: "tool", tool_call_id, content: summary}` message per call, push the assistant's tool-call message too, and loop.
  4. `actions: string[]` accumulates each tool's `summary` across the whole loop, in order — this is what renders as the compact per-action lines.
- New `POST /api/ai/chat/confirm-delete` route (or a query flag on the same route — a separate route is clearer): body `{ projectId, taskId }`, calls `getCurrentUser()` + `deleteTask(projectId, taskId)` directly (no AI call at all), returns `{ ok, error }`.

### `src/components/ai/AIChat.tsx` (rewritten)

- `Message` gains optional `actions?: string[]` and `pendingDelete?: { taskId: string; title: string }`.
- Renders `actions` as small muted lines above the assistant bubble (✓ prefix), and, when `pendingDelete` is present on the last message, a small inline confirm/cancel button pair. Confirm calls the new `confirm-delete` route, then appends a system-style "✓ Deleted task: X" line itself (no further AI call).
- Brought in line with the rest of the app's i18n (it currently has zero — hardcoded English strings): add an `aiChat` message namespace, all four languages (en/pl/de/es), for the header, placeholder, empty state, "Thinking…", the action-line prefix, and the confirm/cancel buttons.

### Cleanup

- `src/lib/ai/orchestrator.ts` rewritten to the loop described above (or deleted if the route handler is simple enough to hold it directly — decide during planning based on final size).
- `src/lib/mcp/server.ts` and `src/lib/mcp/client.ts` deleted: after this change nothing imports them (verified: today only `orchestrator.ts` does).

## Non-goals

Streaming responses, multi-project chat, exposing this same tool set through `/api/v1` or `/api/mcp` (those stay API-key-only), editing/canceling an in-flight AI turn, undo for non-delete actions (existing `activity_logs`/comment history already records what changed, same as any UI-driven edit).

## Testing

No `.env.local` here, so no live LLM call is possible. Verify: `npx tsc --noEmit`, `npm run lint` (baseline must not grow), `npm run test:db` (unaffected — no schema change), `npm run build`. For the tool dispatcher, write a scratch script that calls `runChatTool` for each tool name against the PGlite harness already used elsewhere in this session, asserting the right Server Action ran and `pendingDelete` is set (never an actual delete) for `propose_delete_task`. State plainly that no real provider round-trip (Anthropic/OpenAI HTTP call) was exercised.
