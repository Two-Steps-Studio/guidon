import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dataClient } from "@/lib/data-client";
import { getApiUserClient } from "./api-key-auth";

/**
 * The data client (lib/data-client) for an /api/v1 request: identity comes
 * from the API key (guard.userId), not a browser session - so in Supabase
 * mode queries run on getApiUserClient's key-scoped JWT client instead of
 * the cookie client, and in self-hosted mode under withUser(userId) as
 * usual. RLS applies exactly as for that user in the browser.
 */
export function apiDataClient(userId: string) {
  return dataClient(userId, { supabase: () => getApiUserClient(userId) as Promise<SupabaseClient> });
}
