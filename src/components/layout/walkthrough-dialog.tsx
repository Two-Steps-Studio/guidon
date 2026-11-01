"use client";

/**
 * Przewodnik po aplikacji (walkthrough) — okno slajdów z najważniejszymi
 * miejscami Guidona.
 *
 * Pokazuje się automatycznie raz na konto (klucz localStorage per userId):
 * nowe konto w tej samej przeglądarce dostaje własne powitanie, a „Pomiń
 * i nie pokazuj ponownie" zapisuje znacznik wyłącznie dla tego konta.
 * Przycisk w stopce sidebara otwiera przewodnik ręcznie z każdej strony
 * (wzór: FeedbackMenuItem).
 *
 * Zamknięcie krzyżykiem (X) nie zapisuje znacznika — przewodnik wróci przy
 * następnym wejściu, czego nie zrobić osoba, która kończy serię „Dalej"
 * do końca (ostatni slajd zapisuje znacznik jak „Pomiń").
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Brain, CalendarDays, CheckSquare, FileText, Rocket, Sparkles, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/** `guidon.walkthrough.seen.v1:<userId>` — wersjonowany, bo treść slajdów się zmienia. */
function seenKey(userId: string): string {
  return `guidon.walkthrough.seen.v1:${userId}`;
}

function isWalkthroughSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markWalkthroughSeen(userId: string): void {
  try {
    window.localStorage.setItem(seenKey(userId), "1");
  } catch {
    // Tryb prywatny itp. — bez znacznika przewodnik wróci, to tylko UX.
  }
}

interface WalkthroughDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function WalkthroughDialog({ userId, open, onOpenChange }: WalkthroughDialogProps) {
  const t = useTranslations("walkthrough");
  const [step, setStep] = useState(0);

  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Sparkles, title: t("step1Title"), body: t("step1Body") },
    { icon: CheckSquare, title: t("step2Title"), body: t("step2Body") },
    { icon: FileText, title: t("step3Title"), body: t("step3Body") },
    { icon: Brain, title: t("step4Title"), body: t("step4Body") },
    { icon: CalendarDays, title: t("step5Title"), body: t("step5Body") },
    { icon: Bot, title: t("step6Title"), body: t("step6Body") },
    { icon: Rocket, title: t("step7Title"), body: t("step7Body") },
  ];
  const total = steps.length;
  const isLast = step === total - 1;
  const current = steps[step];
  const Icon = current.icon;

  const handleSkip = () => {
    if (userId) markWalkthroughSeen(userId);
    onOpenChange(false);
  };

  const handleNext = () => {
    if (isLast) {
      handleSkip(); // przejście do końca = znany przewodnik, nie wraca
      return;
    }
    setStep(step + 1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setStep(0); // ponowne otwarcie zaczyna od slajdu 1
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
          <p className="text-xs tabular-nums text-muted-foreground">{t("stepOf", { step: step + 1, total })}</p>
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <h3 className="text-base font-semibold">{current.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              {t("skip")}
            </Button>
            <div className="flex gap-2 sm:justify-end">
              <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
                {t("back")}
              </Button>
              <Button size="sm" onClick={handleNext}>
                {isLast ? t("done") : t("next")}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Automatyczne pierwsze uruchomienie: efekt uruchamia się po nawodnieniu,
 * więc bez nieścisłości SSR. Otwarte tylko, gdy konto nie zaznaczyło
 * „pomiń" w tej przeglądarce (klucz per userId, nie per przeglądarka).
 */
export function WalkthroughAutoOpen({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (userId && !isWalkthroughSeen(userId)) setOpen(true);
  }, [userId]);

  return <WalkthroughDialog userId={userId} open={open} onOpenChange={setOpen} />;
}

/** Ręczne uruchomienie: wpis „Przewodnik" w stopce sidebara — see FeedbackMenuItem. */
export function WalkthroughMenuItem({ userId }: { userId: string | null }) {
  const t = useTranslations("walkthrough");
  const [open, setOpen] = useState(false);

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton type="button" tooltip={t("launcher")} onClick={() => setOpen(true)}>
          <Sparkles />
          <span>{t("launcher")}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <WalkthroughDialog userId={userId} open={open} onOpenChange={setOpen} />
    </>
  );
}
