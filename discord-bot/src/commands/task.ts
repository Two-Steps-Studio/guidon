import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { listTasks, startTask, completeTask, commentOnTask, type GuidonTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task")
  .setDescription("Work with this server's linked Guidon project")
  .addSubcommand((sub) => sub.setName("list").setDescription("List this project's tasks"))
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Mark a task as in progress")
      .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("complete")
      .setDescription("Mark a task as done")
      .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("comment")
      .setDescription("Add a comment to a task")
      .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true))
      .addStringOption((opt) => opt.setName("text").setDescription("Comment text").setRequired(true))
  );

function formatTaskList(tasks: GuidonTask[]): string {
  if (tasks.length === 0) return "No tasks in this project.";
  // Discord message bodies cap at 2000 chars - a large board would blow
  // past that fast, so this caps the list rather than truncating mid-line.
  const LIST_LIMIT = 25;
  const lines = tasks
    .slice(0, LIST_LIMIT)
    .map((task) => `\`${task.id.slice(0, 8)}\` **${task.title}** — ${task.status} (${task.priority})`);
  const suffix = tasks.length > LIST_LIMIT ? `\n…and ${tasks.length - LIST_LIMIT} more.` : "";
  return lines.join("\n") + suffix;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "list") {
    const result = await listTasks(link.apiKey, link.projectId);
    if (!result.ok) {
      await interaction.editReply(`Could not load tasks: ${result.error}`);
      return;
    }
    await interaction.editReply(formatTaskList(result.data.tasks));
    return;
  }

  const taskId = interaction.options.getString("task-id", true).trim();

  if (subcommand === "start") {
    const result = await startTask(link.apiKey, taskId);
    await interaction.editReply(result.ok ? `▶️ **${result.data.task.title}** is now in progress.` : `Could not start that task: ${result.error}`);
    return;
  }

  if (subcommand === "complete") {
    const result = await completeTask(link.apiKey, taskId);
    await interaction.editReply(result.ok ? `✅ **${result.data.task.title}** marked done.` : `Could not complete that task: ${result.error}`);
    return;
  }

  if (subcommand === "comment") {
    const text = interaction.options.getString("text", true);
    const result = await commentOnTask(link.apiKey, taskId, text);
    await interaction.editReply(result.ok ? "💬 Comment added." : `Could not add that comment: ${result.error}`);
    return;
  }
}
