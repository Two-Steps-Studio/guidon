import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { signInLocal } from "@/lib/auth/local-auth";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api/api-keys";
import type { ApiKeyScope } from "@/lib/api/scopes";

/**
 * Email/password "login" for external clients that can't do a browser
 * OAuth/cookie flow - the Unity/UE5 editor plugins. Unlike every other
 * /api/v1 route, this one is NOT guarded by guardApiRequest/an existing API
 * key: that's the point, it's how a plugin gets its first key without the
 * user ever visiting the website. Same bespoke-auth precedent the API's own
 * README already carves out for webhooks (signature verification instead
 * of a Bearer key) - a route can have its own auth model when the caller
 * genuinely can't use the standard one.
 *
 * Verifies credentials exactly the way the website's own login does
 * (signInLocal for self-hosted, Supabase's password grant for hosted - see
 * src/app/auth/login/{actions.ts,login-form.tsx}), then issues a fresh,
 * scoped API key for that user and hands back the raw value once - after
 * this point it's a completely ordinary API key, indistinguishable from one
 * created by hand on the Profile page (it shows up there too, so the user
 * can revoke it if a device is lost).
 *
 * Re-logging in revokes the previous auto-issued key for the same plugin
 * rather than accumulating one per login - api_keys only stores a hash, so
 * an old key's raw value can never be recovered/reused anyway, and this
 * keeps the Profile > API Keys list from filling up with dead entries.
 */

const PLUGIN_KEY_SCOPES: ApiKeyScope[] = ["tasks:read", "tasks:status", "comments:write"];
const PLUGIN_KEY_NAME = "Unity Plugin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required." }, { status: 400 });
  }

  const fullKey = generateApiKey();
  const hash = hashApiKey(fullKey);
  const prefix = keyPrefix(fullKey);

  if (hasDirectDatabase()) {
    const result = await signInLocal(email, password);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });

    await withUser(result.userId, async ({ query }) => {
      await query(
        "UPDATE api_keys SET revoked_at = now() WHERE user_id = $1 AND name = $2 AND revoked_at IS NULL",
        [result.userId, PLUGIN_KEY_NAME]
      );
      await query(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes)
         VALUES ($1, $2, $3, $4, $5)`,
        [result.userId, PLUGIN_KEY_NAME, prefix, hash, PLUGIN_KEY_SCOPES]
      );
    });

    return NextResponse.json({ apiKey: fullKey, email });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Authentication is not configured on this instance." }, { status: 500 });
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // `supabase` is now authenticated as this user (signInWithPassword set the
  // session on this client instance) - the same RLS policies that gate
  // Profile > API Keys' own create/revoke actions apply here unchanged, no
  // service-role bypass needed.
  await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", data.user.id)
    .eq("name", PLUGIN_KEY_NAME)
    .is("revoked_at", null);

  const { error: insertError } = await supabase.from("api_keys").insert({
    user_id: data.user.id,
    name: PLUGIN_KEY_NAME,
    key_prefix: prefix,
    key_hash: hash,
    scopes: PLUGIN_KEY_SCOPES,
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ apiKey: fullKey, email: data.user.email ?? email });
}
