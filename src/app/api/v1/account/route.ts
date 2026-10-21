import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { authenticateApiKey, type ApiKeyIdentity } from "@/lib/api/api-key-auth";
import { serviceDataClient } from "@/lib/data-client";
import { deleteAccount, getAccountDeletionPlan } from "@/lib/account/delete-account";
import { confirmationMatches } from "@/lib/account/account-deletion-core";
import { bearerChallenge } from "@/lib/oauth/oauth-core";
import { SITE_URL } from "@/lib/site-url";

/**
 * Account deletion from the mobile app (App Store guideline 5.1.1(v): an app
 * that lets people sign in must let them delete the account in the app).
 *
 * Only a key a person uses directly - human_client, i.e. the mobile app or
 * an editor plugin - and only with the account's email in the body. An AI
 * agent's key or an OAuth token for some MCP client can never delete the
 * account that authorised it.
 *
 * GET says what would happen (the same plan the profile page shows);
 * DELETE { "confirm_email": "..." } does it.
 */
async function personalIdentity(
  request: NextRequest
): Promise<{ error: NextResponse; identity?: never } | { identity: ApiKeyIdentity; error?: never }> {
  const identity = await authenticateApiKey(request.headers.get("authorization"));
  if (!identity) {
    return {
      error: NextResponse.json(
        { error: "Invalid or missing API key." },
        { status: 401, headers: { "WWW-Authenticate": bearerChallenge(SITE_URL, "/api/v1") } }
      ),
    };
  }
  if (!identity.humanClient) {
    return {
      error: NextResponse.json(
        { error: "Only the Guidon app itself can delete an account. Use Profile -> Delete account on the website." },
        { status: 403 }
      ),
    };
  }
  return { identity };
}

async function handleGET(request: NextRequest) {
  const result = await personalIdentity(request);
  if (result.error) return result.error;
  return NextResponse.json({ plan: await getAccountDeletionPlan(result.identity.userId) });
}

async function handleDELETE(request: NextRequest) {
  const result = await personalIdentity(request);
  if (result.error) return result.error;
  const body = (await request.json().catch(() => null)) as { confirm_email?: unknown } | null;
  const { data: profile } = await serviceDataClient()
    .from<{ email: string }>("profiles")
    .select("email")
    .eq("id", result.identity.userId)
    .maybeSingle();
  if (!confirmationMatches(body?.confirm_email, profile?.email)) {
    return NextResponse.json({ error: "confirm_email must be the account's email address." }, { status: 400 });
  }
  const deleted = await deleteAccount(result.identity.userId);
  if (!deleted.ok) {
    return NextResponse.json(
      { error: "Make someone else owner of these organizations first.", code: "organizations_need_owner", organizations: deleted.blockers },
      { status: 409 }
    );
  }
  return NextResponse.json({ deleted: true, deleted_organizations: deleted.deletedOrganizations });
}

export const GET = apiRoute(handleGET);
export const DELETE = apiRoute(handleDELETE);
