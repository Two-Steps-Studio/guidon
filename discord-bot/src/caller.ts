import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { getLinkByGuild, getUserApiKey, type GuildLink } from "./db.js";

export interface Caller {
  link: GuildLink;
  /** The key the command calls Guidon with. */
  apiKey: string;
  /** True when it's the user's own key from /guidon-login. */
  personal: boolean;
}

const NOT_LINKED = "This server isn't linked to a Guidon project yet - ask an admin to run `/guidon-link` first.";
const SIGN_IN =
  "Sign in to Guidon first: run `/guidon-login` - commands then act as you, with your own role in the project.";

/**
 * Picks the key a /task-* command runs with. Someone signed in with
 * /guidon-login acts as themselves. Otherwise the server-wide key from
 * /guidon-link (owned by whoever linked the server) is used - only for reading
 * the board, or for members who can manage the server, which is who could run
 * these commands before personal sign-in existed. Replies and returns null
 * when the command can't run.
 */
export async function resolveCaller(
  interaction: ChatInputCommandInteraction,
  { write }: { write: boolean }
): Promise<Caller | null> {
  const link = await getLinkByGuild(interaction.guildId!);
  if (!link) {
    await interaction.editReply(NOT_LINKED);
    return null;
  }

  const personalKey = await getUserApiKey(interaction.user.id);
  if (personalKey) return { link, apiKey: personalKey, personal: true };

  if (write && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply(SIGN_IN);
    return null;
  }
  return { link, apiKey: link.apiKey, personal: false };
}
