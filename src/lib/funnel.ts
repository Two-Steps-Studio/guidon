/**
 * The landing page's sign-up buttons whose clicks are counted (migration
 * 096): a daily total per name, nothing about who clicked. Only names in
 * this list are accepted by /api/funnel/cta.
 */
export const FUNNEL_CTAS = ["hero-start", "hero-sandbox", "pricing-free", "pricing-paid"] as const;
export type FunnelCta = (typeof FUNNEL_CTAS)[number];

export function isFunnelCta(value: unknown): value is FunnelCta {
  return typeof value === "string" && (FUNNEL_CTAS as readonly string[]).includes(value);
}

/** One cohort row of public.admin_funnel_cohorts (096), with each step as a share of sign-ups. */
export type FunnelCohort = {
  week: string;
  signedUp: number;
  steps: { key: "createdProject" | "createdTask" | "connectedIntegration" | "startedCheckout" | "paid"; count: number; percent: number }[];
};

export function toFunnelCohort(row: { week: string | Date; signed_up: number; created_project: number; created_task: number; connected_integration: number; started_checkout: number; paid: number }): FunnelCohort {
  const signedUp = Number(row.signed_up);
  const percent = (count: number) => (signedUp ? Math.round((count / signedUp) * 100) : 0);
  const step = (key: FunnelCohort["steps"][number]["key"], value: number) => ({ key, count: Number(value), percent: percent(Number(value)) });
  return {
    week: (row.week instanceof Date ? row.week.toISOString() : String(row.week)).slice(0, 10),
    signedUp,
    steps: [
      step("createdProject", row.created_project),
      step("createdTask", row.created_task),
      step("connectedIntegration", row.connected_integration),
      step("startedCheckout", row.started_checkout),
      step("paid", row.paid),
    ],
  };
}

/** Totals per known button over the last `days` days (UTC dates). */
export function recentCtaTotals(rows: { day: string | Date; cta: string; count: number }[], days: number, now = new Date()): { cta: FunnelCta; count: number }[] {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return FUNNEL_CTAS.map((cta) => ({
    cta,
    count: rows.filter((row) => row.cta === cta && new Date(row.day).toISOString().slice(0, 10) >= since).reduce((sum, row) => sum + Number(row.count), 0),
  }));
}
