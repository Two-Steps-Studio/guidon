import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { completeTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-complete")
  .setDescription("Mark a task as done")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const taskId = interaction.options.getString("task-id", true).trim();
  const result = await completeTask(link.apiKey, taskId);
  await interaction.editReply(
    result.ok ? `✅ **${result.data.task.title}** marked done.` : `Could not complete that task: ${result.error}`
  );
}
