"use server";

import { redirect } from "next/navigation";
import { requireAdminIdentity } from "@/lib/data/admin-access";
import { configuredAdminSsoProvider, createAdminSession, getAdminSsoProof, isAdminAuthSessionActive, revokeAdminSession } from "@/lib/admin/session";
import { ADMIN_SIGN_IN_PATH } from "@/lib/admin/session-policy";
import { createClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";

function fail(status: "sso" | "code" | "session"): never {
  redirect(`${ADMIN_SIGN_IN_PATH}?status=${status}`);
}

export async function beginAdminSso() {
  const providerId = configuredAdminSsoProvider();
  if (!providerId) redirect("/dashboard");
  const supabase = await createClient();
  const callback = new URL("/auth/callback", SITE_URL);
  callback.searchParams.set("redirect", ADMIN_SIGN_IN_PATH);
  const { data, error } = await supabase.auth.signInWithSSO({
    providerId, options: { redirectTo: callback.href, skipBrowserRedirect: true },
  });
  if (error || !data?.url || !data.url.startsWith("https://")) fail("sso");
  redirect(data.url);
}

export async function verifyAdminMfa(form: FormData) {
  if (!configuredAdminSsoProvider()) redirect("/dashboard");
  const admin = await requireAdminIdentity();
  const before = await getAdminSsoProof(admin.id);
  if (!admin.grantId || !before || !await isAdminAuthSessionActive(admin.id, before.sessionId)) fail("sso");

  const code = form.get("code");
  const factorId = form.get("factor");
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim()) || typeof factorId !== "string") fail("code");
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (!factors?.totp.some(factor => factor.id === factorId && factor.status === "verified")) fail("code");
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error || !data?.access_token) fail("code");

  const after = await getAdminSsoProof(admin.id, data.access_token);
  if (!after?.mfaVerified || after.sessionId !== before.sessionId ||
      !await isAdminAuthSessionActive(admin.id, after.sessionId) ||
      !await revokeAdminSession() || !await createAdminSession(admin.grantId, after.sessionId)) fail("session");
  redirect("/admin");
}

export async function endAdminSession() {
  if (!configuredAdminSsoProvider()) redirect("/dashboard");
  await requireAdminIdentity();
  if (!await revokeAdminSession()) fail("session");
  redirect("/dashboard");
}
