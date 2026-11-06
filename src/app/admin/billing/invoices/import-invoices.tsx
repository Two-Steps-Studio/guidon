"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importOrganizationInvoices } from "./actions";

export function ImportInvoices({ organizationId }: { organizationId?: string }) {
  const t = useTranslations("admin.invoices");
  const [org, setOrg] = useState(organizationId ?? "");
  const [cursor, setCursor] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return <form className="space-y-2 rounded-xl border p-4" onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await importOrganizationInvoices(org.trim(), cursor);
        if (result.error || !("imported" in result) || typeof result.imported !== "number") {
          setFailed(true);
          return;
        }
        setImported(result.imported);
        setCursor(result.next ?? null);
      } catch {
        setFailed(true);
      }
    });
  }}>
    <label className="grid max-w-md gap-1 text-sm">{t("organizationId")}
      <Input required maxLength={36} value={org} disabled={pending} onChange={event => {
        setOrg(event.target.value);
        setCursor(null);
        setImported(null);
        setFailed(false);
      }} />
    </label>
    <Button type="submit" disabled={pending} variant="outline">{t(cursor ? "importNext" : "import")}</Button>
    {failed ? <p role="alert">{t("importFailed")}</p>
      : imported !== null && <p role="status">{t("imported", { count: imported })}</p>}
  </form>;
}
