import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { loadPlans, loadStoredPrices, previewPriceSync } from "@/lib/billing/price-sync";
import type { PriceSyncPlan, SyncInterval } from "@/lib/billing/price-sync-core";
import { SITE_URL } from "@/lib/site-url";
import { SyncPricesButton } from "./sync-button";

const INTERVALS: SyncInterval[] = ["week", "month", "year"];
const NOT_SOLD = new Set(["free", "enterprise"]);

const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;

type RowStatus = "inSync" | "new" | "changed" | "removed" | "missing";

/**
 * Which price sells each plan for a week, a month and a year: what the
 * database has (plan_prices, migration 071 - read by the billing page and
 * Checkout) next to what Stripe sells now, and one button to make the
 * database match. Also the Stripe settings the instance needs, without
 * showing any secret.
 */
export default async function AdminBillingPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");
  const configured = !hasDirectDatabase() && isBillingConfigured();
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const mode = secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_") ? "live" : secretKey ? "test" : null;
  const webhookSecretSet = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

  const [plans, stored] = await Promise.all([loadPlans(), loadStoredPrices()]);
  let preview: PriceSyncPlan | null = null;
  let stripeError = false;
  if (configured) {
    try {
      preview = await previewPriceSync();
    } catch (error) {
      console.error("Stripe price preview failed:", error);
      stripeError = true;
    }
  }

  const sold = plans.filter((plan) => !NOT_SOLD.has(plan.id));
  const rows = sold.flatMap((plan) =>
    INTERVALS.map((interval) => {
      const current = stored.find((row) => row.active && row.plan_id === plan.id && row.billing_interval === interval) ?? null;
      const next = preview?.matches.find((match) => match.planId === plan.id && match.interval === interval) ?? null;
      let status: RowStatus = "missing";
      if (current && next) {
        status = current.stripe_price_id === next.priceId && current.amount_cents === next.amountCents ? "inSync" : "changed";
      } else if (next) status = "new";
      else if (current) status = preview ? "removed" : "inSync";
      return { plan, interval, current, next, status };
    })
  );
  const pendingChanges = rows.some((row) => row.status === "new" || row.status === "changed" || row.status === "removed");

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("pricesTitle")}</h2>
        <p className="text-muted-foreground">{t("pricesDescription")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("pricesSetupTitle")}</CardTitle>
          <CardDescription>{t("pricesSetupDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>
              <span className={mode ? "text-success" : "text-destructive"}>{mode ? "✓" : "✗"}</span>{" "}
              {mode ? t("pricesKeySet", { mode }) : t("pricesKeyMissing")}
            </li>
            <li>
              <span className={webhookSecretSet ? "text-success" : "text-destructive"}>{webhookSecretSet ? "✓" : "✗"}</span>{" "}
              {webhookSecretSet ? t("pricesWebhookSet") : t("pricesWebhookMissing")}
            </li>
            <li className="text-muted-foreground">
              {t("pricesWebhookUrl")} <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">{`${SITE_URL}/api/stripe/webhook`}</code>
              {" - "}
              {t("pricesWebhookEvents")}
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pricesTableTitle")}</CardTitle>
          <CardDescription>{t("pricesTableDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasDirectDatabase() ? (
            <p className="text-sm text-muted-foreground">{t("pricesSelfHosted")}</p>
          ) : !configured ? (
            <p className="text-sm text-muted-foreground">{t("pricesNotConfigured")}</p>
          ) : stripeError ? (
            <p className="text-sm text-destructive">{t("pricesStripeError")}</p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>{t("pricesColPlan")}</th>
                  <th>{t("pricesColPeriod")}</th>
                  <th>{t("pricesColCurrent")}</th>
                  <th>{t("pricesColStripe")}</th>
                  <th>{t("pricesColStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ plan, interval, current, next, status }) => (
                  <tr key={`${plan.id}-${interval}`} className="border-b border-border last:border-0 [&>td]:px-3 [&>td]:py-2">
                    <td className="font-medium">{plan.name}</td>
                    <td>{t("pricesInterval", { interval })}</td>
                    <td className="tabular-nums">
                      {current ? (
                        <>
                          {euros(current.amount_cents)} <span className="font-mono text-xs text-muted-foreground">{current.stripe_price_id}</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="tabular-nums">
                      {next ? (
                        <>
                          {euros(next.amountCents)} <span className="font-mono text-xs text-muted-foreground">{next.priceId}</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={status === "inSync" ? "text-success" : status === "missing" ? "text-muted-foreground" : "text-warning"}>
                      {t("pricesStatus", { status })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview && preview.errors.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive">
              {preview.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {preview && preview.skipped.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer">{t("pricesSkipped", { count: preview.skipped.length })}</summary>
              <ul className="mt-2 space-y-1">
                {preview.skipped.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </details>
          )}

          <SyncPricesButton disabled={!preview || preview.errors.length > 0 || !pendingChanges} />
          {preview && !pendingChanges && preview.errors.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("pricesUpToDate")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
