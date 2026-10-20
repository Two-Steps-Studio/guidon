"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createPromoCode, setPromoCodeActive } from "./actions";

/** A readable random code: no 0/O/1/I to misread. */
function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function CreatePromoCodeForm({ plans }: { plans: { id: string; name: string }[] }) {
  const t = useTranslations("admin");
  const [code, setCode] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [days, setDays] = useState("30");
  const [maxUses, setMaxUses] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createPromoCode({
        code,
        planId,
        durationDays: Number(days),
        maxRedemptions: maxUses.trim() ? Number(maxUses) : null,
        expiresOn: expiresOn || null,
        note,
      });
      if (result.error) setError(result.error);
      else {
        setCreated(code.trim().toUpperCase());
        setCode("");
        setNote("");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span>{t("promoFieldCode")}</span>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={40}
              required
              className="font-mono uppercase"
            />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setCode(randomCode())}>
              {t("promoGenerate")}
            </Button>
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("promoFieldPlan")}</span>
          <Select className="h-9 w-full" value={planId} onChange={(event) => setPlanId(event.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("promoFieldDays")}</span>
          <Input type="number" min={1} max={3650} value={days} onChange={(event) => setDays(event.target.value)} required />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("promoFieldMaxUses")}</span>
          <Input type="number" min={1} value={maxUses} placeholder={t("promoUnlimited")} onChange={(event) => setMaxUses(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("promoFieldExpires")}</span>
          <Input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("promoFieldNote")}</span>
          <Input value={note} maxLength={500} placeholder={t("promoNotePlaceholder")} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !code.trim() || !planId}>
          {t("promoCreate")}
        </Button>
        {created && <span className="text-sm text-success">{t("promoCreated", { code: created })}</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}

export function PromoCodeToggle({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setPromoCodeActive(id, !active);
            setError(result.error);
          })
        }
      >
        {active ? t("promoDisable") : t("promoEnable")}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
