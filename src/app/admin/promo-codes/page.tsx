import { Ticket } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { CreatePromoCodeForm, PromoCodeToggle } from "./promo-code-forms";

interface PromoCodeRow {
  id: string;
  code: string;
  plan_id: string;
  duration_days: number;
  max_redemptions: number | null;
  redemption_count: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
}

function codeStatus(code: PromoCodeRow): "Active" | "Off" | "Expired" | "UsedUp" {
  if (!code.active) return "Off";
  if (code.expires_at !== null && new Date(code.expires_at).getTime() <= Date.now()) return "Expired";
  if (code.max_redemptions !== null && code.redemption_count >= code.max_redemptions) return "UsedUp";
  return "Active";
}

/**
 * Guidon promo codes (migration 062): a paid plan for free for N days,
 * redeemed by an organization's owner/admin on its Billing page. Discounts
 * on a paid plan are Stripe promotion codes instead (Stripe Dashboard),
 * typed at checkout.
 */
export default async function AdminPromoCodesPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");
  const db = serviceDataClient();

  const [{ data: codes, error }, { data: plans }] = await Promise.all([
    db.from<PromoCodeRow>("promo_codes").select("*").order("created_at", { ascending: false }).limit(500),
    db.from<{ id: string; name: string }>("plans").select("id, name").order("sort_order", { ascending: true }),
  ]);
  const planName = new Map(plans.map((plan) => [plan.id, plan.name]));

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("promoTitle")}</h2>
        <p className="text-muted-foreground">{t("promoDescription")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("promoCreateTitle")}</CardTitle>
          <CardDescription>{t("promoCreateDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreatePromoCodeForm plans={plans.filter((plan) => plan.id !== "free")} />
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">{t("promoMigrationMissing")}</p>
      ) : codes.length === 0 ? (
        <EmptyState icon={Ticket} title={t("promoEmptyTitle")} description={t("promoEmptyDescription")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>{t("promoColCode")}</th>
                  <th>{t("promoColGrants")}</th>
                  <th>{t("promoColUses")}</th>
                  <th>{t("promoColValidUntil")}</th>
                  <th>{t("promoColNote")}</th>
                  <th>{t("promoColStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => {
                  const status = codeStatus(code);
                  return (
                    <tr key={code.id} className="border-b border-border last:border-0 [&>td]:px-4 [&>td]:py-2">
                      <td className="font-mono">{code.code}</td>
                      <td>{t("promoGrants", { plan: planName.get(code.plan_id) ?? code.plan_id, days: code.duration_days })}</td>
                      <td className="tabular-nums">
                        {code.redemption_count}
                        {code.max_redemptions !== null && ` / ${code.max_redemptions}`}
                      </td>
                      <td>{code.expires_at ? new Date(code.expires_at).toLocaleDateString() : t("promoNoEnd")}</td>
                      <td className="max-w-[16rem] truncate text-muted-foreground">{code.note}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={status === "Active" ? "text-success" : "text-muted-foreground"}>
                            {t(`promoStatus${status}`)}
                          </span>
                          <PromoCodeToggle id={code.id} active={code.active} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
