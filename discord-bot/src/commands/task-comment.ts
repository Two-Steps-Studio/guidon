import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild } from "../db.js";
import { commentOnTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-comment")
  .setDescription("Add a comment to a task")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true))
  .addStringOption((opt) => opt.setName("text").setDescription("Comment text").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply("This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.");
    return;
  }

  const taskId = interaction.options.getString("task-id", true).trim();
  const text = interaction.options.getString("text", true);
  const result = await commentOnTask(link.apiKey, taskId, text);
  await interaction.editReply(result.ok ? "💬 Comment added." : `Could not add that comment: ${result.error}`);
}
