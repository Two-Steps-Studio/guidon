"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { createAuthorizationCode } from "@/lib/oauth/oauth";
import { checkAuthorizeRequest, type AuthorizeParams } from "@/lib/oauth/authorize-request";
import { authorizationResponseUrl } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

const FIELDS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "scope", "state", "resource"] as const;

function paramsFrom(form: FormData): AuthorizeParams {
  return Object.fromEntries(
    FIELDS.map((field) => [field, typeof form.get(field) === "string" ? (form.get(field) as string) : undefined])
  ) as AuthorizeParams;
}

/**
 * Allow / Cancel on the consent screen. The request is checked again from
 * scratch - the hidden fields are only a copy of the URL, not trusted.
 */
export async function decideAuthorization(form: FormData): Promise<void> {
  const check = await checkAuthorizeRequest(paramsFrom(form));
  if (check.kind === "fatal") throw new Error(check.reason);
  if (check.kind === "redirect") redirect(check.url);

  if (form.get("decision") !== "allow") {
    redirect(authorizationResponseUrl(check.redirectUri, { error: "access_denied", error_description: "The person declined.", state: check.state }, SITE_URL));
  }

  const user = await getCurrentUser();
  const code = await createAuthorizationCode({
    client: check.client,
    userId: user.id,
    scopes: check.scopes,
    resource: check.resource,
    redirectUri: check.redirectUri,
    codeChallenge: check.codeChallenge,
  });
  redirect(authorizationResponseUrl(check.redirectUri, { code, state: check.state }, SITE_URL));
}
