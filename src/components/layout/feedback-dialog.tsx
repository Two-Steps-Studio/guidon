"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, MessageSquarePlus, Star } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { FEEDBACK_MAX_LENGTH, isFeedbackRating } from "@/lib/feedback";


/**
 * "Send feedback" entry in the sidebar's profile footer, next to Log out -
 * available from every page, same reasoning as the profile link itself.
 * Self-contained (owns its own dialog/form/submit state), same shape as
 * LanguageSwitcher right below it in app-sidebar.tsx.
 */
export function FeedbackMenuItem() {
  const t = useTranslations("feedback");
  const messageId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMessage("");
    setRating(null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFeedbackRating(rating)) { setError(t("ratingRequired")); return; }
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitFeedback(message, window.location.pathname, rating);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Closes the dialog and confirms via toast rather than an in-dialog
      // "sent" screen - the message is already gone from view, so there's
      // nothing left to look at inside the dialog once it worked.
      setOpen(false);
      toast.success(t("thanks"));
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <fieldset disabled={submitting} className="space-y-2">
              <legend className="text-sm font-medium">{t("ratingLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {[1,2,3,4,5].map(value => <label key={value} className="cursor-pointer">
                  <input type="radio" name="feedback-rating" value={value} checked={rating === value} onChange={() => setRating(value)} required aria-label={t("ratingValue", { rating: value })} className="peer sr-only" />
                  <span className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-border px-2 text-muted-foreground peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50">
                    <Star aria-hidden className={`size-4 ${rating !== null && value <= rating ? "fill-current" : ""}`} /><span>{value}</span>
                  </span>
                </label>)}
              </div>
              <p className="text-xs text-muted-foreground">{t("ratingHint")}</p>
            </fieldset>
            <Label htmlFor={messageId}>{t("messageLabel")}</Label>
            <Textarea
              id={messageId}
              autoFocus
              rows={5}
              value={message}
              maxLength={FEEDBACK_MAX_LENGTH}
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
              <Button type="submit" disabled={submitting || message.trim().length === 0 || rating === null}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
