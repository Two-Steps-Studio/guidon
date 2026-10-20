"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { redeemPromoCode } from "./promo-actions";

/** Billing: redeem a Guidon promo code (a plan for free for a while - migration 062). */
export function PromoCodeCard({ organizationId, planNames }: { organizationId: string; planNames: Record<string, string> }) {
  const t = useTranslations("organizations.billing");
  const format = useFormatter();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await redeemPromoCode(organizationId, code);
      if (!result.ok) {
        setError(t(`promoErrors.${result.error}`));
        return;
      }
      setCode("");
      setMessage(
        t("promoRedeemed", {
          plan: planNames[result.planId] ?? result.planId,
          date: format.dateTime(new Date(result.grantedUntil), { dateStyle: "long" }),
        })
      );
      router.refresh();
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          {t("promoTitle")}
        </CardTitle>
        <CardDescription>{t("promoDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t("promoLabel")}
            placeholder={t("promoPlaceholder")}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-64 font-mono uppercase"
          />
          <Button type="submit" size="sm" disabled={pending || !code.trim()}>
            {t("promoRedeem")}
          </Button>
        </form>
        {message && (
          <p className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />
            {message}
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
