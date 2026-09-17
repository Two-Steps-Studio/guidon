import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { listTasks } from "../guidon-api.js";
import { linkGuildToProject } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("guidon-link")
  .setDescription("Link this Discord server to a Guidon project")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) =>
    opt.setName("api-key").setDescription("A Guidon API key (Profile → API Keys)").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("project-id").setDescription("The Guidon project's id (from its Settings page URL)").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const apiKey = interaction.options.getString("api-key", true).trim();
  const projectId = interaction.options.getString("project-id", true).trim();

  // Doubles as validation: a key that's malformed, revoked, or whose owning
  // user isn't a member of this project all fail the same way here - see
  // guidon-api.ts's listTasks() doc comment.
  const result = await listTasks(apiKey, projectId);
  if (!result.ok) {
    await interaction.editReply(
      `Could not verify that key against project \`${projectId}\`: ${result.error}\n\nDouble-check the API key (Profile → API Keys in Guidon) and the project id (copied from its Settings page URL).`
    );
    return;
  }

  const linked = await linkGuildToProject(interaction.guildId!, interaction.guild?.name ?? null, projectId, apiKey);
  if (!linked.ok) {
    await interaction.editReply(linked.error);
    return;
  }

  await interaction.editReply(
    `✅ This server is now linked to Guidon project \`${projectId}\`. Try \`/task list\`.`
  );
}
