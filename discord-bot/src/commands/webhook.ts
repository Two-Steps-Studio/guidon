import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { saveWebhookForGuild } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("guidon-webhook")
  .setDescription("Set this channel's webhook URL for Guidon task notifications")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) =>
    opt
      .setName("url")
      .setDescription("A Discord channel webhook URL (channel settings → Integrations → Webhooks)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const url = interaction.options.getString("url", true).trim();
  if (!url.startsWith("https://discord.com/api/webhooks/")) {
    await interaction.editReply("That doesn't look like a Discord webhook URL (should start with `https://discord.com/api/webhooks/`).");
    return;
  }

  const result = await saveWebhookForGuild(interaction.guildId!, url);
  if (!result.ok) {
    await interaction.editReply(result.error);
    return;
  }

  await interaction.editReply("✅ Task notifications will be posted to that webhook from now on.");
}
