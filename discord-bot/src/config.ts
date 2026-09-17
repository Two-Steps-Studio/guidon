import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set - see discord-bot/README.md`);
  return value;
}

/**
 * Same dual-mode split as the main app's hasDirectDatabase()
 * (src/lib/db/pool.ts): DATABASE_URL set means self-hosted Postgres,
 * otherwise Supabase (service role, so this bot can read/write
 * discord_integrations directly, bypassing RLS the same way
 * scripts/migrate.mjs already does for schema changes - see
 * 035_discord_integration.sql's own comment for why that's the right
 * trust level for this specific table).
 */
export const config = {
  discordToken: required("DISCORD_BOT_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  guidonApiUrl: required("GUIDON_API_URL").replace(/\/$/, ""),
  authSecret: required("AUTH_SECRET"),
  databaseUrl: process.env.DATABASE_URL ?? null,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
};

export function hasDirectDatabase(): boolean {
  return config.databaseUrl !== null;
}

if (!hasDirectDatabase() && (!config.supabaseUrl || !config.supabaseServiceRoleKey)) {
  throw new Error(
    "Set either DATABASE_URL (self-hosted Postgres) or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Guidon Cloud) - see discord-bot/README.md"
  );
}
