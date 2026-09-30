// No imports: loaded by tests/webhooks.test.mjs with Node's type stripping.

/**
 * Chat services reject Guidon's own JSON envelope - Discord answers HTTP 400
 * ("Cannot send an empty message") to anything without `content`/`embeds`,
 * Slack answers 400 "no_text" without `text`. Their incoming-webhook URLs
 * have fixed, recognisable shapes, so the format follows from the URL and
 * nobody has to pick it: those two get a native message, everything else
 * the documented envelope (docs/webhooks.md).
 */
export type WebhookFormat = "guidon" | "discord" | "slack";

const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);

export function detectWebhookFormat(url: string): WebhookFormat {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "guidon";
  }
  const host = parsed.hostname.toLowerCase();
  if (DISCORD_HOSTS.has(host) && parsed.pathname.startsWith("/api/webhooks/")) return "discord";
  if (host === "hooks.slack.com" && parsed.pathname.startsWith("/services/")) return "slack";
  return "guidon";
}

/** The envelope deliverWebhook builds - see docs/webhooks.md. */
export interface WebhookEnvelope {
  type: string;
  project?: { id: string; name: string };
  data?: { task?: { id: string; title: string; status?: string; url: string }; webhook_id?: string };
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  ai_working: "AI Working",
  review: "Review",
  done: "Done",
};

// Discord embed colours: brand blue, amber for moves, green for done.
const COLORS = { created: 0x3b82f6, moved: 0xf59e0b, done: 0x22c55e, ping: 0x64748b };

function headline(envelope: WebhookEnvelope): { text: string; color: number } {
  const status = envelope.data?.task?.status;
  switch (envelope.type) {
    case "ping":
      return { text: "Guidon webhook connected", color: COLORS.ping };
    case "task.created":
      return { text: "New task", color: COLORS.created };
    case "task.completed":
      return { text: "Task completed", color: COLORS.done };
    default:
      return status === "done"
        ? { text: "Task completed", color: COLORS.done }
        : { text: `Task moved to ${STATUS_LABELS[status ?? ""] ?? status ?? "another column"}`, color: COLORS.moved };
  }
}

/** Discord caps an embed title at 256 characters. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The request body for `format`. `guidon` returns the envelope unchanged. */
export function formatWebhookBody(format: WebhookFormat, envelope: WebhookEnvelope): unknown {
  if (format === "guidon") return envelope;

  const { text, color } = headline(envelope);
  const task = envelope.data?.task;
  const project = envelope.project?.name;

  if (format === "discord") {
    return {
      username: "Guidon",
      allowed_mentions: { parse: [] },
      embeds: [
        task
          ? { author: { name: text }, title: clip(task.title, 256), url: task.url, color, footer: project ? { text: project } : undefined }
          : { title: text, description: "Task events from this organization will appear here.", color },
      ],
    };
  }

  // Slack: `text` is required; <url|label> is its link syntax, and & < >
  // must be escaped in anything user-written.
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (!task) return { text: `${text}. Task events from this organization will appear here.` };
  const where = project ? ` in ${escape(project)}` : "";
  return { text: `${text}${where}: <${task.url}|${escape(task.title)}>` };
}

/**
 * First line of a receiver's error body for the webhook's "last error" -
 * Discord/Slack say exactly what they rejected ({"message": "..."}, "no_text").
 */
export function describeReceiverError(status: number, body: string): string {
  let detail = body.trim();
  try {
    const json = JSON.parse(detail) as { message?: unknown; error?: unknown };
    const message = json.message ?? json.error;
    if (typeof message === "string") detail = message;
  } catch {
    // Plain-text body - use as is.
  }
  detail = detail.split("\n")[0].slice(0, 200);
  return detail ? `Receiver responded with HTTP ${status}: ${detail}` : `Receiver responded with HTTP ${status}.`;
}
