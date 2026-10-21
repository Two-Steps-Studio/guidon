// No imports: loaded by tests/agent-web.test.mjs with Node's type stripping.

/**
 * The A2A docs agent's JSON-RPC handling (src/app/api/a2a), apart from the
 * search itself. Both protocol versions in use are answered:
 * - v1.0: `SendMessage`, parts like `{ text }`, roles ROLE_USER/ROLE_AGENT,
 *   the result wraps the reply as `{ message }`.
 * - v0.3: `message/send`, parts like `{ kind: "text", text }`, roles
 *   user/agent, the result is the message itself with `kind: "message"`.
 * Every answer is a direct message - no tasks are created, so GetTask and
 * friends always report "task not found".
 */

export interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

type Answer = (question: string) => string;

const TASK_METHODS = new Set(["GetTask", "CancelTask", "tasks/get", "tasks/cancel", "tasks/resubscribe", "SubscribeToTask"]);

export function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** The text of a message's text parts, joined; null when there is none. */
export function messageText(params: unknown): { text: string; contextId?: string } | null {
  const message = (params as { message?: { parts?: unknown; contextId?: unknown } } | null)?.message;
  if (!message || !Array.isArray(message.parts)) return null;
  const text = message.parts
    .map((part: unknown) => (part && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
    .join("\n")
    .trim();
  if (!text) return null;
  return { text: text.slice(0, 2000), contextId: typeof message.contextId === "string" ? message.contextId : undefined };
}

export function handleA2a(body: JsonRpcRequest, answer: Answer, newId: () => string) {
  if (!body || typeof body !== "object" || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body?.id, -32600, "Invalid JSON-RPC request.");
  }
  const { id, method } = body;
  if (TASK_METHODS.has(method)) return rpcError(id, -32001, "Task not found: this agent answers with messages and keeps no tasks.");
  const v1 = method === "SendMessage";
  if (!v1 && method !== "message/send") {
    return rpcError(id, -32601, `Method not found: ${method}. This agent supports SendMessage (A2A 1.0) and message/send (A2A 0.3).`);
  }
  const input = messageText(body.params);
  if (!input) return rpcError(id, -32602, "params.message needs at least one text part.");

  const text = answer(input.text);
  const contextId = input.contextId ?? newId();
  const messageId = newId();
  const result = v1
    ? { message: { role: "ROLE_AGENT", messageId, contextId, parts: [{ text, mediaType: "text/markdown" }] } }
    : { kind: "message", role: "agent", messageId, contextId, parts: [{ kind: "text", text }] };
  return { jsonrpc: "2.0", id: id ?? null, result };
}
