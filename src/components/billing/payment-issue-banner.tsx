import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { PaymentState } from "@/lib/billing/billing-core";
import { cn } from "@/lib/utils";

/**
 * A failed subscription payment (migration 071): during the grace period
 * the plan still works and this says until when; after it, Free's limits
 * apply until the card is fixed. Renders nothing while payments are fine.
 * `action` is the billing page's own "update payment" button; elsewhere,
 * pass `billingHref` for a link to that page instead.
 */
export async function PaymentIssueBanner({
  payment,
  action,
  billingHref,
  className,
}: {
  payment: PaymentState;
  action?: React.ReactNode;
  billingHref?: string;
  className?: string;
}) {
  if (payment.kind === "ok") return null;
  const t = await getTranslations("organizations.billing");
  const suspended = payment.kind === "suspended";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm",
        suspended ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5",
        className
      )}
    >
      <AlertTriangle className={cn("h-5 w-5 shrink-0", suspended ? "text-destructive" : "text-warning")} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">{suspended ? t("paymentSuspendedTitle") : t("paymentGraceTitle")}</p>
        <p className="text-muted-foreground">
          {suspended
            ? t("paymentSuspendedDescription")
            : t("paymentGraceDescription", { date: payment.graceEndsAt })}
        </p>
      </div>
      {action}
      {!action && billingHref && (
        <Link href={billingHref} className="font-medium text-primary underline underline-offset-2">
          {t("updatePayment")}
        </Link>
      )}
    </div>
  );
}
