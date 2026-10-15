import { NextRequest, NextResponse } from "next/server";
import { apiDataClient } from "@/lib/api/api-data-client";
import { setTaskStatus } from "@/lib/api/task-transitions";
import { isPermissionDenied } from "@/lib/db/errors";
import { findSlackChannelLink, type SlackChannelLink } from "@/lib/data/slack-integration";
import { SITE_URL } from "@/lib/site-url";
import {
  DEFAULT_LIST_STATUSES,
  HELP_TEXT,
  SLACK_STATUSES,
  escapeMrkdwn,
  formatTaskList,
  gitRef,
  parseSlackCommand,
  resolveTaskRef,
  type SlackTask,
} from "@/lib/slack/commands";
import { createSlackLinkToken } from "@/lib/slack/link-token";
import { verifySlackSignature } from "@/lib/slack/signature";
import { BOARD_COLUMNS, resolveBoardColumns, type BoardColumnOverride } from "@/lib/work/task-board";

/** How actions from Slack show up in Guidon (comments, activity) - the person stays the RLS/audit identity. */
const SLACK_ACTOR = { botLabel: "Slack bot", humanClient: true } as const;
/** Upper bound of tasks loaded to resolve a `guidon#1a2b3c4d` reference. */
const TASK_LOOKUP_LIMIT = 5000;

type Reply = { response_type: "ephemeral" | "in_channel"; text: string };

const ephemeral = (text: string): Reply => ({ response_type: "ephemeral", text });

/**
 * The `/guidon` slash command (docs/slack.md). Slack POSTs
 * application/x-www-form-urlencoded with no Guidon session; the request is
 * trusted only after its signature checks out against SLACK_SIGNING_SECRET,
 * and then only to name a team and channel. What the command does runs as
 * the person who connected that channel (migration 056), under their RLS -
 * so it can never do more than they could in the browser, and only in the
 * channel's project. Slack wants an answer within 3 seconds: every command
 * here is a couple of queries.
 *
 * Humans type these commands, so they are not held to the project's AI
 * permissions (humanClient) - unlike the Discord bot, whose key predates
 * that distinction. Actions are labelled "Slack bot" and name the Slack user
 * in the reply.
 */
export async function POST(request: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "The Slack integration is not configured on this server." }, { status: 404 });
  }

  const rawBody = await request.text();
  const verified = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    signingSecret,
  });
  if (!verified) return NextResponse.json({ error: "Invalid Slack signature." }, { status: 401 });

  const form = new URLSearchParams(rawBody);
  // Slack's periodic certificate check on the command URL.
  if (form.get("ssl_check") === "1") return new NextResponse(null, { status: 200 });

  const teamId = form.get("team_id") ?? "";
  const channelId = form.get("channel_id") ?? "";
  if (!teamId || !channelId) return NextResponse.json(ephemeral("Slack didn't say which channel this came from."));

  try {
    return NextResponse.json(await handle(form, teamId, channelId));
  } catch (error) {
    console.error("Slack command failed:", error);
    return NextResponse.json(ephemeral("Something went wrong in Guidon. Try again in a moment."));
  }
}

async function handle(form: URLSearchParams, teamId: string, channelId: string): Promise<Reply> {
  const command = parseSlackCommand(form.get("text") ?? "");
  // Name for the comment text stored in Guidon; in Slack replies a mention, which Slack renders and keeps current.
  const slackUser = form.get("user_name") || "Someone";
  const slackUserId = form.get("user_id") ?? "";
  const who = /^[UW][A-Z0-9]{2,}$/.test(slackUserId) ? `<@${slackUserId}>` : escapeMrkdwn(slackUser);

  switch (command.kind) {
    case "help":
      return ephemeral(HELP_TEXT);
    case "usage":
      return ephemeral(command.message);
    case "unknown":
      return ephemeral(`Unknown command "${escapeMrkdwn(command.word)}".\n\n${HELP_TEXT}`);
    case "link":
      return linkReply(form, teamId, channelId, await findSlackChannelLink(teamId, channelId));
  }

  const link = await findSlackChannelLink(teamId, channelId);
  if (!link) return ephemeral("This channel isn't connected to a Guidon project yet. Run `/guidon link` to connect it.");
  if (!link.linkedBy) {
    return ephemeral("The person who connected this channel no longer has a Guidon account. Run `/guidon link` to connect it again.");
  }
  const userId = link.linkedBy;
  const db = apiDataClient(userId);

  // RLS doesn't error for someone who lost access - it just shows nothing.
  // Asking for the project itself tells "no access" apart from "no tasks".
  const { data: project } = await db
    .from<{ id: string; name: string }>("projects")
    .select("id, name")
    .eq("id", link.projectId)
    .maybeSingle();
  if (!project) return ephemeral(noAccessText());

  const { data: tasks, error } = await db
    .from<SlackTask & { sort_order: number | null }>("tasks")
    .select("id, title, status, priority, sort_order")
    .eq("project_id", link.projectId)
    .is("parent_task_id", null)
    .order("sort_order", { ascending: true })
    .limit(TASK_LOOKUP_LIMIT);
  if (error) {
    // RLS hides the project from someone who lost access: report it as such.
    return ephemeral(noAccessText());
  }

  if (command.kind === "list") {
    const statuses = command.statuses === "all" ? SLACK_STATUSES : command.statuses;
    const order = new Map<string, number>(SLACK_STATUSES.map((status, i) => [status, i]));
    const shown = tasks
      .filter((task) => (statuses as readonly string[]).includes(task.status))
      .sort((a, b) => (order.get(a.status) ?? 0) - (order.get(b.status) ?? 0));
    const labelFor = await columnLabels(link);
    const scope = command.statuses === "all" ? "all tasks" : statuses === DEFAULT_LIST_STATUSES ? "open tasks" : labelFor(statuses[0]);
    return ephemeral(`*${escapeMrkdwn(project.name)}* - ${escapeMrkdwn(scope)}\n${formatTaskList(shown, labelFor, (id) => taskUrl(link.projectId, id))}`);
  }

  const resolved = resolveTaskRef(command.ref, tasks);
  if ("error" in resolved) {
    const reasons = {
      invalid: "Use the task's reference from `/guidon list`, e.g. `guidon#1a2b3c4d`.",
      not_found: `No task matching \`${escapeMrkdwn(command.ref)}\` in this channel's project.`,
      ambiguous: `More than one task matches \`${escapeMrkdwn(command.ref)}\` - use more characters.`,
    };
    return ephemeral(reasons[resolved.error]);
  }
  const task = resolved.task;
  const taskLabel = `\`${gitRef(task.id)}\` <${taskUrl(link.projectId, task.id)}|${escapeMrkdwn(task.title)}>`;

  if (command.kind === "comment") {
    const { error: commentError } = await db
      .from("task_comments")
      .insert({ task_id: task.id, author_id: userId, content: `${command.text}\n\n- ${slackUser} (Slack)`, actor_label: SLACK_ACTOR.botLabel });
    if (commentError) {
      if (isPermissionDenied(commentError)) return ephemeral(noAccessText());
      console.error("Slack comment failed:", commentError);
      return ephemeral("Could not post the comment.");
    }
    return { response_type: "in_channel", text: `${who} commented on ${taskLabel}:\n>${escapeMrkdwn(command.text).replace(/\n/g, "\n>")}` };
  }

  const status = command.kind === "start" ? "in_progress" : "done";
  const result = await setTaskStatus(userId, task.id, status, SLACK_ACTOR);
  if (!result.ok) {
    return ephemeral(result.status === 403 || result.status === 404 ? noAccessText() : `Could not update the task: ${escapeMrkdwn(result.error)}`);
  }
  const verb = command.kind === "start" ? "started" : "finished";
  return { response_type: "in_channel", text: `${who} ${verb} ${taskLabel}` };
}

function linkReply(form: URLSearchParams, teamId: string, channelId: string, current: SlackChannelLink | null): Reply {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return ephemeral("This Guidon server has no AUTH_SECRET set, so it can't create a link.");
  const token = createSlackLinkToken(
    {
      teamId,
      teamName: form.get("team_domain"),
      channelId,
      channelName: form.get("channel_name"),
    },
    secret
  );
  const url = `${SITE_URL}/slack/link?token=${encodeURIComponent(token)}`;
  const already = current
    ? "This channel is already connected to a project; choosing another one moves it (you need to manage both).\n"
    : "";
  return ephemeral(
    `${already}<${url}|Connect this channel to a Guidon project>\nOpen it within 10 minutes and pick a project you own or administer. ` +
      "Commands in this channel then act as you, labelled \"Slack bot\"."
  );
}

async function columnLabels(link: SlackChannelLink): Promise<(status: string) => string> {
  const { data } = await apiDataClient(link.linkedBy!)
    .from<BoardColumnOverride>("project_board_columns")
    .select("status, label, sort_order, hidden")
    .eq("project_id", link.projectId);
  // Hidden columns are left out of the resolved list; their tasks fall back to the default label.
  const columns = resolveBoardColumns(data ?? []);
  return (status) =>
    columns.find((column) => column.status === status)?.label ??
    BOARD_COLUMNS.find((column) => column.status === status)?.label ??
    status;
}

function taskUrl(projectId: string, taskId: string): string {
  return `${SITE_URL}/projects/${projectId}/work?openTask=${taskId}`;
}

function noAccessText(): string {
  return "The person who connected this channel can no longer change tasks in its project. A project owner or admin can run `/guidon link` to reconnect it.";
}
