"use client";

/**
 * Przewodnik po aplikacji (spotlight tour) — podświetla rzeczywiste elementy
 * interfejsu (otwór w przyciemnionej zasłonie), opisuje je w dymku i opcjonalnie
 * prowadzi przyciskiem „Pokaż" na docelową stronę.
 *
 * Pokazuje się automatycznie raz na konto (klucz localStorage per userId;
 * „Pomiń i nie pokazuj ponownie" zapisuje znacznik wyłącznie dla tego konta),
 * a wpis „Przewodnik" w stopce sidebara otwiera go z każdej strony.
 *
 * Kroki bez istniejącego elementu (np. strona, na której czegoś nie ma) są
 * pomijane, więc tour nie może „utknąć" na pustym pomoście.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** `guidon.walkthrough.seen.v1:<userId>` — wersjonowany, bo trasa się zmienia. */
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
    // Tryb prywatny itp. — bez znacznika tour wróci, to tylko UX.
  }
}

/** Odstęp podświetlenia od elementu i szerokość dymka. */
const PAD = 8;
const POPOVER_WIDTH = 340;

interface TourStep {
  /** Selektor CSS elementu docelowego (jedyny, pierwszy trafiony). */
  selector: string;
  title: string;
  body: string;
  /** Przycisk „Pokaż" przenosi tutaj i kończy tour. */
  href?: string;
}

export interface SpotlightTourProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpotlightTour({ userId, open, onOpenChange }: SpotlightTourProps) {
  const t = useTranslations("walkthrough");
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const finish = useCallback(
    (remember: boolean) => {
      if (remember && userId) markWalkthroughSeen(userId);
      onOpenChange(false);
    },
    [userId, onOpenChange]
  );

  // Wejście: zbierz kroki (tylko te, których element faktycznie istnieje),
  // pod eskortą rAF — dokument jest gotowy efektem po nawodnieniu.
  useEffect(() => {
    if (!open) {
      setSteps([]);
      setRect(null);
      setIndex(0);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const all: TourStep[] = [
        { selector: 'a[href="/dashboard"]', title: t("spot1Title"), body: t("spot1Body") },
        { selector: 'a[href="/my-tasks"]', title: t("spot2Title"), body: t("spot2Body") },
        { selector: 'a[href="/projects"]', title: t("spot3Title"), body: t("spot3Body"), href: "/projects" },
        { selector: '[data-tour="command"]', title: t("spot4Title"), body: t("spot4Body") },
        { selector: '[data-tour="bell"]', title: t("spot5Title"), body: t("spot5Body") },
        { selector: 'a[href="/profile"]', title: t("spot6Title"), body: t("spot6Body") },
        { selector: '[data-tour="language"]', title: t("spot7Title"), body: t("spot7Body") },
      ];
      setSteps(
        all.filter((step) => {
          const el = document.querySelector(step.selector);
          return el instanceof HTMLElement && el.offsetParent !== null;
        })
      );
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Escape zamyka bez zapisu znacznika (tour wróci przy następnym wejściu). */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  /* Pomiar elementu bieżącego kroku + przewinięcie do niego. */
  useEffect(() => {
    if (!open || steps.length === 0) return;
    if (index > steps.length - 1) {
      // Element zniknął w międzyczasie — zamiast utknąć, domknij tour.
      finish(false);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(steps[index].selector);
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ block: "nearest", inline: "center" });
      const box = el.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    raf = requestAnimationFrame(() => {
      measure();
      // Dalej: drobne opóźnienie daje układom czas na fold-in po nawodnieniu.
      setTimeout(measure, 350);
    });
    const onScroll = () => requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps, index]);

  /* Połóż dymek poniżej podświetlenia, a gdy brakuje miejsca — nad nim. */
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !rect) return;
    const below = rect.top + rect.height + PAD + el.offsetHeight + 12;
    setPlacement(below < window.innerHeight ? "below" : "above");
  }, [rect, index, steps]);

  if (!open || !rect || steps.length === 0) return null;

  const current = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const highlight = {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  const popoverTop =
    placement === "below" ? highlight.top + highlight.height + 10 : undefined;
  const popoverBottom =
    placement === "above" ? window.innerHeight - highlight.top + 10 : undefined;
  const popoverLeft = Math.min(
    Math.max(12, highlight.left + highlight.width / 2 - POPOVER_WIDTH / 2),
    Math.max(12, window.innerWidth - POPOVER_WIDTH - 12)
  );

  return (
    <div className="fixed inset-0 z-[100]" data-tour-overlay>
      {/* Zasłona z otworem: podświetlony element może być klikany, klik
          poza nim domyka tour (bez zapisu znacznika). */}
      <div
        aria-hidden
        className="absolute rounded-xl transition-all duration-200"
        style={{
          ...highlight,
          boxShadow: "0 0 0 200vmax hsl(0 0% 0% / 0.65)",
        }}
      />
      {/* Przezroczysta warstwa na resztę ekranu: łapie klik w tło. */}
      <button
        type="button"
        aria-label={t("skip")}
        className="fixed inset-0 cursor-default"
        style={{ zIndex: -1 }}
        onClick={() => finish(false)}
      />

      <div
        ref={popoverRef}
        role="dialog"
        aria-label={current.title}
        className="fixed w-[min(340px,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-4 shadow-lg"
        style={{ top: popoverTop, bottom: popoverBottom, left: popoverLeft }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{current.title}</h3>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t("stepOf", { step: index + 1, total: steps.length })}
          </p>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{current.body}</p>

        {current.href && (
          <Button size="sm" className="mt-3 w-full" asChild>
            <Link href={current.href}>
              <Sparkles className="mr-1.5 size-4" aria-hidden />
              {t("ctaOpen")}
            </Link>
          </Button>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => finish(true)}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFirst}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              {t("back")}
            </Button>
            <Button size="sm" onClick={() => (isLast ? finish(true) : setIndex(index + 1))}>
              {isLast ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Automatyczne pierwsze uruchomienie: czekamy na nawodnienie, więc bez
 * nieścisłości SSR. Otwarte tylko, gdy konto nie zaznaczyło „pomiń"
 * w tej przeglądarce (klucz per userId, nie per przeglądarka).
 */
export function WalkthroughAutoOpen({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (userId && !isWalkthroughSeen(userId)) setOpen(true);
  }, [userId]);

  return <SpotlightTour userId={userId} open={open} onOpenChange={setOpen} />;
}

/** Ręczne uruchomienie: wpis „Przewodnik" w stopce sidebara (wzór: FeedbackMenuItem). */
export function WalkthroughMenuItem({ userId }: { userId: string | null }) {
  const t = useTranslations("walkthrough");
  const [open, setOpen] = useState(false);

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton type="button" tooltip={t("launcher")} onClick={() => setOpen(true)}>
          <Sparkles className={cn("size-4 shrink-0")} />
          <span>{t("launcher")}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SpotlightTour userId={userId} open={open} onOpenChange={setOpen} />
    </>
  );
}
