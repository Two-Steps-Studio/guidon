import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { resolveCaller } from "../caller.js";
import { commentOnTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-comment")
  .setDescription("Add a comment to a task")
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true))
  .addStringOption((opt) => opt.setName("text").setDescription("Comment text").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const caller = await resolveCaller(interaction, { write: true });
  if (!caller) return;

  const taskId = interaction.options.getString("task-id", true).trim();
  const text = interaction.options.getString("text", true);
  const result = await commentOnTask(caller.apiKey, taskId, text);
  await interaction.editReply(result.ok ? "💬 Comment added." : `Could not add that comment: ${result.error}`);
}
