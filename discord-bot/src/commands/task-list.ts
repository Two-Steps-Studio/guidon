import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { listTasks, type GuidonTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-list")
  .setDescription("List this server's linked Guidon project's tasks");

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

  const result = await listTasks(link.apiKey, link.projectId);
  if (!result.ok) {
    await interaction.editReply(`Could not load tasks: ${result.error}`);
    return;
  }
  await interaction.editReply(formatTaskList(result.data.tasks));
}
