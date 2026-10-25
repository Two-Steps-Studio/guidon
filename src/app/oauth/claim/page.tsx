import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { claimEmailHash } from "@/lib/oauth/agent-claims-core";
import { getAgentClaim } from "@/lib/oauth/agent-claims";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";
import { submitAgentClaim } from "./actions";

export const metadata: Metadata = { title: "Approve an agent", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
type ScopeKey = "tasks_read" | "tasks_write" | "tasks_status" | "comments_write" | "attempts_write" | "project_read" | "project_write";

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ attempt?: string; result?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const t = await getTranslations("agentClaim");
  const oauth = await getTranslations("oauth");
  const attempt = typeof params.attempt === "string" ? params.attempt : "";
  const claim = await getAgentClaim(attempt);
  const matching = claim && user.email && claim.email_hash === claimEmailHash(user.email);
  const valid = matching;
  return <main className="flex min-h-screen items-center justify-center p-4">
    <Card className="w-full max-w-md">
      <CardHeader><h1 className="font-semibold leading-none tracking-tight">{t("title")}</h1><CardDescription>{t("description")}</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        {!valid ? <p role="alert">{t("invalid")}</p> : claim.state !== "pending" ?
          <p role="status">{t(claim.state === "approved" ? "approved" : "denied")}</p> : <>
            <p>{t("account", { email: user.email! })}</p>
            <p className="break-words font-medium">{t("app", { name: claim.client_name })}</p>
            <p className="text-sm text-muted-foreground">{oauth("unverified")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{claim.scopes.map(scope =>
              <li key={scope}>{oauth(`scopes.${scope.replace(":", "_") as ScopeKey}`)}</li>)}</ul>
            <p className="text-sm text-muted-foreground">{oauth("limits")}</p>
            {params.result === "invalid" && <p role="alert" className="text-sm text-destructive">{t("invalidCode")}</p>}
            <form action={submitAgentClaim} className="space-y-4">
              <input type="hidden" name="attempt" value={attempt} />
              <div className="space-y-2"><Label htmlFor="code">{t("code")}</Label>
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required aria-describedby="code-help" />
                <p id="code-help" className="text-sm text-muted-foreground">{t("codeHelp")}</p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" name="decision" value="deny" formNoValidate variant="outline" className="flex-1">{oauth("deny")}</Button>
                <Button type="submit" name="decision" value="allow" className="flex-1">{oauth("allow")}</Button>
              </div>
            </form>
            <p className="text-sm text-muted-foreground">{t("revoke")}</p>
          </>}
      </CardContent>
    </Card>
  </main>;
}
