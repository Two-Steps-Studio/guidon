import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../config.js";
import { getLinkByGuild } from "../db.js";
import { createGuildLinkToken } from "../link-token.js";

export const data = new SlashCommandBuilder()
  .setName("guidon-link")
  .setDescription("Link (or move) this Discord server to a Guidon project")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const token = createGuildLinkToken(guildId, interaction.guild?.name ?? "");
  const base = config.guidonApiUrl.replace(/\/+$/, "");
  const url = `${base}/discord/link?token=${encodeURIComponent(token)}`;

  // A DB hiccup must not stop the link from being handed out - the status
  // sentence is just a courtesy, so omit it if the lookup fails.
  let status: string | null = null;
  try {
    const existing = await getLinkByGuild(guildId);
    status = existing
      ? "This server is currently linked to a Guidon project — using the link below and choosing another project will move it."
      : "This server isn't linked to a Guidon project yet.";
  } catch (err) {
    console.error("guidon-link: could not look up the current link:", err);
  }

  const lines = [
    ...(status ? [status, ""] : []),
    url,
    "",
    "The link is valid for 10 minutes; you'll sign in to Guidon if needed and choose which project to attach.",
  ];
  await interaction.editReply(lines.join("\n"));
}
