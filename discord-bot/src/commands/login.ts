import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../config.js";
import { getUserApiKey } from "../db.js";
import { createUserLoginToken } from "../link-token.js";

export const data = new SlashCommandBuilder()
  .setName("guidon-login")
  .setDescription("Sign in with your Guidon account so /task commands act as you");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Ephemeral: the link signs in whoever opens it as this Discord account.
  await interaction.deferReply({ ephemeral: true });

  const token = createUserLoginToken(interaction.user.id, interaction.user.username);
  const url = `${config.guidonApiUrl.replace(/\/+$/, "")}/discord/login?token=${encodeURIComponent(token)}`;

  let status: string | null = null;
  try {
    status = (await getUserApiKey(interaction.user.id))
      ? "You're already signed in - opening the link signs you in again (for example with a different Guidon account after `/guidon-logout`)."
      : null;
  } catch (err) {
    console.error("guidon-login: could not look up the current sign-in:", err);
  }

  await interaction.editReply(
    [
      ...(status ? [status, ""] : []),
      url,
      "",
      "Open it, sign in to Guidon if needed and confirm. The link is valid for 10 minutes; don't share it.",
    ].join("\n")
  );
}
