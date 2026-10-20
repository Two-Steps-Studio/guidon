import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { resolveCaller } from "../caller.js";
import { completeTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-complete")
  .setDescription("Mark a task as done")
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const caller = await resolveCaller(interaction, { write: true });
  if (!caller) return;

  const taskId = interaction.options.getString("task-id", true).trim();
  const result = await completeTask(caller.apiKey, taskId);
  await interaction.editReply(
    result.ok ? `✅ **${result.data.task.title}** marked done.` : `Could not complete that task: ${result.error}`
  );
}
