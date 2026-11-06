import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getOptionalCurrentUser } from "@/lib/data/current-user";
import { requireAdminIdentity } from "@/lib/data/admin-access";
import { configuredAdminSsoProvider, getAdminSsoProof, isAdminAuthSessionActive } from "@/lib/admin/session";
import { createClient } from "@/lib/supabase-server";
import { beginAdminSso, verifyAdminMfa } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSignIn({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const t = await getTranslations("auth.admin");
  const { status } = await searchParams;
  const enabled = Boolean(configuredAdminSsoProvider());
  const user = enabled ? await getOptionalCurrentUser() : null;
  const proof = user ? await getAdminSsoProof(user.id) : null;
  const active = user && proof ? await isAdminAuthSessionActive(user.id, proof.sessionId) : false;
  let factors: { id: string; friendly_name?: string }[] = [];
  if (active) {
    await requireAdminIdentity();
    const supabase = await createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    factors = data?.totp.filter(factor => factor.status === "verified") ?? [];
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <div className="w-full space-y-5 rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {status === "sso" || status === "code" || status === "session" ? (
          <p role="alert" className="text-sm text-destructive">{t(`errors.${status}`)}</p>
        ) : null}
        {!enabled ? <p className="text-sm text-muted-foreground">{t("unavailable")}</p> : !active ? (
          <form action={beginAdminSso}>
            <Button className="w-full" type="submit">{t("continueSso")}</Button>
          </form>
        ) : factors.length === 0 ? <p className="text-sm text-muted-foreground">{t("noFactor")}</p> : (
          <form action={verifyAdminMfa} className="space-y-4">
            {factors.length === 1 ? <input type="hidden" name="factor" value={factors[0].id} /> : (
              <div className="space-y-2">
                <Label htmlFor="admin-factor">{t("factor")}</Label>
                <Select id="admin-factor" name="factor">
                  {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || t("factorNumber", { number: index + 1 })}</option>)}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="admin-code">{t("code")}</Label>
              <Input id="admin-code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <Button type="submit" className="w-full">{t("verify")}</Button>
          </form>
        )}
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-2">{t("back")}</Link>
      </div>
    </div>
  );
}
