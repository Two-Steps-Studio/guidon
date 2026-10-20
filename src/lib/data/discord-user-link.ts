import "server-only";

import { dataClient, serviceDataClient } from "@/lib/data-client";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { mintApiKey } from "@/lib/api/mint-api-key";
import type { ApiKeyScope } from "@/lib/api/api-keys";

/** Must match discord-bot/src/db.ts's API_KEY_INFO - the bot decrypts this column. */
const DISCORD_BOT_KEY_INFO = "discord-bot-key-v1";
/** Same scopes as the server-wide bot key: exactly what the /task-* commands call. */
const DISCORD_USER_KEY_SCOPES: ApiKeyScope[] = ["tasks:read", "tasks:status", "comments:write"];

export const DISCORD_ACCOUNT_LINKED_ELSEWHERE_ERROR =
  "This Discord account is signed in to another Guidon account. Run /guidon-logout in Discord first, then /guidon-login again.";

export type LinkDiscordUserResult = { ok: true } | { ok: false; error: string };

/**
 * The web half of `/guidon-login` (src/app/discord/login): signs a Discord
 * account in to the caller's Guidon account. Mints a personal API key owned
 * by `userId` (human_client, like the editor plugins' login - the person, not
 * an AI agent, is acting) and stores it encrypted for discord-bot/, which then
 * runs that person's /task-* commands with it. Their own role in the project
 * decides what works, through RLS, instead of the server-wide key of whoever
 * linked the server.
 *
 * Signing in again replaces the previous key (revoked here, so Profile > API
 * Keys doesn't fill up). A Discord account already signed in to someone else
 * is refused: RLS hides that row, so the update matches nothing and the insert
 * hits the primary key.
 */
export async function linkDiscordUser(
  userId: string,
  discordUserId: string,
  discordUsername: string | null
): Promise<LinkDiscordUserResult> {
  const db = dataClient(userId);

  const { data: previous, error: readError } = await db
    .from<{ api_key_id: string | null }>("discord_user_links")
    .select("api_key_id")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  if (readError) {
    console.error("linkDiscordUser: reading the current link failed:", readError);
    return { ok: false, error: "Could not sign in the Discord account. Please try again." };
  }

  const name = `Discord${discordUsername ? ` (${discordUsername})` : ""}`;
  const minted = await mintApiKey(db, userId, name, DISCORD_USER_KEY_SCOPES);
  if (minted.error || !minted.fullKey || !minted.row) {
    console.error("linkDiscordUser: creating the API key failed:", minted.error);
    return { ok: false, error: "Could not create an API key for the Discord bot." };
  }
  const keyId = minted.row.id;

  const revoke = async (id: string) => {
    const { error } = await db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) console.error(`linkDiscordUser: could not revoke API key ${id}:`, error);
  };

  const { error: linkError } = await db.upsertRow("discord_user_links", {
    key: { discord_user_id: discordUserId },
    set: {
      discord_username: discordUsername,
      api_key_id: keyId,
      api_key_encrypted: encryptSecret(minted.fullKey, DISCORD_BOT_KEY_INFO),
      updated_at: new Date().toISOString(),
    },
    insertOnly: { user_id: userId },
  });
  if (linkError) {
    await revoke(keyId);
    if (linkError.code === "23505") return { ok: false, error: DISCORD_ACCOUNT_LINKED_ELSEWHERE_ERROR };
    console.error("linkDiscordUser: saving the link failed:", linkError);
    return { ok: false, error: "Could not sign in the Discord account. Please try again." };
  }

  // human_client is service-only (039): a user can't mark their own key as
  // "a person" and skip the AI gates for an agent. Set by the server here, as
  // for plugin logins.
  const { error: markError } = await serviceDataClient()
    .from("api_keys")
    .update({ human_client: true })
    .eq("id", keyId);
  if (markError) console.error(`linkDiscordUser: could not mark API key ${keyId} as human_client:`, markError);

  if (previous?.api_key_id && previous.api_key_id !== keyId) await revoke(previous.api_key_id);
  return { ok: true };
}
