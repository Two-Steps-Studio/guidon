"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyAdminAccountOperation } from "./actions";

type Operation = "recovery" | "block" | "unblock";

export function AdminAccountOperations({ userId, canRecover, canBlock, canUnblock }: {
  userId: string;
  canRecover: boolean;
  canBlock: boolean;
  canUnblock: boolean;
}) {
  const t = useTranslations("admin.recovery");
  const operations: Operation[] = [];
  if (canRecover) operations.push("recovery");
  if (canBlock) operations.push("block");
  if (canUnblock) operations.push("unblock");
  const [operation, setOperation] = useState<Operation>(operations[0]);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"sent" | "failed" | "limited">();
  const [pending, startTransition] = useTransition();

  return <form className="space-y-3 rounded-xl border p-4" onSubmit={event => {
    event.preventDefault();
    if (pending || confirmation !== userId) return;
    setStatus(undefined);
    startTransition(async () => {
      try {
        const result = await applyAdminAccountOperation(operation, userId, confirmation);
        setStatus(result.error === null ? "sent" : result.error === "limited" ? "limited" : "failed");
        if (result.error === null) setConfirmation("");
      } catch {
        setStatus("failed");
      }
    });
  }}>
    <h3 className="font-semibold">{t("title")}</h3>
    <label className="grid gap-1 text-sm">
      {t("operation")}
      <select value={operation} onChange={event => {
        setOperation(event.target.value as Operation);
        setConfirmation("");
        setStatus(undefined);
      }} disabled={pending} className="h-9 rounded-md border border-input bg-background px-2">
        {operations.map(item => <option key={item} value={item}>{t(item)}</option>)}
      </select>
    </label>
    <p className="text-sm text-muted-foreground">{t(operation === "recovery" ? "description" : "signinDescription")}</p>
    <label className="grid gap-1 text-sm">
      {t("confirm")}
      <Input value={confirmation} onChange={event => setConfirmation(event.target.value)}
        disabled={pending} maxLength={36} autoComplete="off" spellCheck={false} />
    </label>
    <Button type="submit" variant="outline" disabled={pending || confirmation !== userId}>{t(operation)}</Button>
    {status && <p className="text-sm" role={status === "sent" ? "status" : "alert"}>
      {t(status === "sent" && operation !== "recovery" ? "updated" : status)}
    </p>}
  </form>;
}
