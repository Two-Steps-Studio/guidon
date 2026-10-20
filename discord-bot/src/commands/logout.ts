import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { removeUserLink } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("guidon-logout")
  .setDescription("Sign your Discord account out of Guidon");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const removed = await removeUserLink(interaction.user.id);
  await interaction.editReply(
    removed
      ? "Signed out. Your Discord API key is revoked; run `/guidon-login` to sign in again."
      : "You weren't signed in to Guidon."
  );
}
