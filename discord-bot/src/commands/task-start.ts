import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { resolveCaller } from "../caller.js";
import { startTask } from "../guidon-api.js";

export const data = new SlashCommandBuilder()
  .setName("task-start")
  .setDescription("Mark a task as in progress")
  .addStringOption((opt) => opt.setName("task-id").setDescription("Task id").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const caller = await resolveCaller(interaction, { write: true });
  if (!caller) return;

  const taskId = interaction.options.getString("task-id", true).trim();
  const result = await startTask(caller.apiKey, taskId);
  await interaction.editReply(
    result.ok ? `▶️ **${result.data.task.title}** is now in progress.` : `Could not start that task: ${result.error}`
  );
}
