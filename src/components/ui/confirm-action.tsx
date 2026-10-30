"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";

type Request = { message: string; accept?: string; resolve: (accepted: boolean) => void };
const EVENT = "guidon:confirm-action";

/** Fail closed if the host is not mounted; never silently approve a mutation. */
export function confirmAction(message: string, accept?: string): Promise<boolean> {
  return new Promise(resolve => {
    const event = new CustomEvent<Request>(EVENT, { cancelable: true, detail: { message, accept, resolve } });
    if (window.dispatchEvent(event)) resolve(false);
  });
}

export function ConfirmActionHost() {
  const t = useTranslations("common");
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    const pending = new Set<Request>();
    const receive = (event: Event) => {
      event.preventDefault();
      const request = (event as CustomEvent<Request>).detail;
      const original = request.resolve;
      const entry = { ...request, resolve: (accepted: boolean) => { pending.delete(entry); original(accepted); } };
      pending.add(entry);setQueue(current => [...current, entry]);
    };
    window.addEventListener(EVENT, receive);
    return () => { window.removeEventListener(EVENT, receive);pending.forEach(request => request.resolve(false)); };
  }, []);
  const finish = (accepted: boolean) => {
    queue[0]?.resolve(accepted);setQueue(current => current.slice(1));
  };
  return <Dialog open={queue.length > 0} onOpenChange={open => { if (!open) finish(false); }}>
    <DialogContent motion={queue.length ? "default" : "none"} showCloseButton={false} className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t("confirmActionTitle")}</DialogTitle><DialogDescription className="whitespace-pre-wrap">{queue[0]?.message}</DialogDescription></DialogHeader>
      <DialogFooter><Button autoFocus variant="outline" onClick={() => finish(false)}>{t("cancel")}</Button><Button variant="destructive" onClick={() => finish(true)}>{queue[0]?.accept ?? t("confirmActionContinue")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
