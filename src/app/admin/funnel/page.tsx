import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { recentCtaTotals, toFunnelCohort } from "@/lib/funnel";

/**
 * Sign-up -> activation -> subscription funnel (migration 096): weekly
 * sign-up cohorts and how many reached each step, plus the landing page's
 * button totals. Aggregates only - no person is listed. Service role,
 * cross-tenant by design, like the other admin pages.
 */
export default async function AdminFunnelPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin.funnel");
  const db = serviceDataClient();
  const [cohortsResult, ctaResult] = await Promise.all([
    db.rpcRows<{ week: string | Date; signed_up: number; created_project: number; created_task: number; connected_integration: number; started_checkout: number; paid: number }>("admin_funnel_cohorts", { p_weeks: 8 }),
    db.from("funnel_cta_counts").select<{ day: string | Date; cta: string; count: number }>("day, cta, count").order("day", { ascending: false }).limit(500),
  ]);
  if (cohortsResult.error || ctaResult.error) throw new Error("Could not load the funnel. Apply migration 096 before deployment.");
  const cohorts = cohortsResult.data.map(toFunnelCohort);
  const ctaTotals = recentCtaTotals(ctaResult.data, 28);
  const stepKeys = ["createdProject", "createdTask", "connectedIntegration", "startedCheckout", "paid"] as const;
  const cell = "border-b p-2 text-right tabular-nums";

  return (
    <div className="container mx-auto max-w-7xl space-y-8 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <section className="space-y-3" aria-labelledby="funnel-cohorts">
        <h3 id="funnel-cohorts" className="text-lg font-semibold">{t("cohortsTitle")}</h3>
        {cohorts.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : (
          <div className="max-w-full overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr>
                <th scope="col" className="border-b p-2 text-left">{t("week")}</th>
                <th scope="col" className="border-b p-2 text-right">{t("signedUp")}</th>
                {stepKeys.map((key) => <th key={key} scope="col" className="border-b p-2 text-right">{t(`step.${key}`)}</th>)}
              </tr></thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.week}>
                    <th scope="row" className="border-b p-2 text-left font-normal tabular-nums">{cohort.week}</th>
                    <td className={cell}>{cohort.signedUp}</td>
                    {cohort.steps.map((step) => <td key={step.key} className={cell}>{step.count} <span className="text-muted-foreground">({step.percent}%)</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("definitions")}</p>
      </section>

      <section className="space-y-3" aria-labelledby="funnel-cta">
        <h3 id="funnel-cta" className="text-lg font-semibold">{t("ctaTitle")}</h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ctaTotals.map((row) => (
            <li key={row.cta} className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">{t(`cta.${row.cta}`)}</p>
              <p className="text-2xl font-semibold tabular-nums">{row.count}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("ctaDescription")}</p>
      </section>
    </div>
  );
}
