"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, MessageSquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { submitFeedback } from "@/app/feedback/actions";

const MAX_MESSAGE_LENGTH = 4000;

/**
 * "Send feedback" entry in the sidebar's profile footer, next to Log out -
 * available from every page, same reasoning as the profile link itself.
 * Self-contained (owns its own dialog/form/submit state), same shape as
 * LanguageSwitcher right below it in app-sidebar.tsx.
 */
export function FeedbackMenuItem() {
  const t = useTranslations("feedback");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setMessage("");
    setError(null);
    setSent(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitFeedback(message, window.location.pathname);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    } catch {
      setError(t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          tooltip={t("sendFeedback")}
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <MessageSquarePlus />
          <span>{t("sendFeedback")}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          {sent ? (
            <>
              <p className="text-sm text-muted-foreground">{t("thanks")}</p>
              <DialogFooter>
                <Button type="button" onClick={() => setOpen(false)}>
                  {t("close")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Textarea
                autoFocus
                rows={5}
                value={message}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={t("placeholder")}
                disabled={submitting}
                onChange={(event) => setMessage(event.target.value)}
              />
              {error && (
                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={submitting || message.trim().length === 0}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("send")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
