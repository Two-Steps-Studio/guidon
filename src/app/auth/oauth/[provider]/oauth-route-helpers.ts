import "server-only";

import type { NextRequest } from "next/server";
import { localOAuthProviders, type LocalOAuthProvider } from "@/lib/auth/oauth-local-core";
import { appOrigin } from "@/lib/site-url";

export { appOrigin };

export const OAUTH_STATE_COOKIE = "guidon-oauth";
export const OAUTH_COOKIE_PATH = "/auth/oauth";

export function findProvider(id: string): LocalOAuthProvider | null {
  return localOAuthProviders(process.env).find((provider) => provider.id === id) ?? null;
}

export function callbackUrl(request: NextRequest, provider: LocalOAuthProvider): string {
  return `${appOrigin(request)}/auth/oauth/${provider.id}/callback`;
}

export function loginErrorUrl(request: NextRequest, message: string): URL {
  return new URL(`/auth/login?error=${encodeURIComponent(message)}`, appOrigin(request));
}
