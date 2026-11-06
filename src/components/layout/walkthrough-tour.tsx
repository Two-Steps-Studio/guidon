"use client";

/**
 * Przewodnik po aplikacji (spotlight tour) — podświetla rzeczywiste elementy
 * interfejsu (otwór w przyciemnionej zasłonie) i opisuje je w dymku. Klik w
 * podświetlony element zamyka tour i wykonuje akcję (np. „Nowe zadanie"),
 * więc pierwszego taska można dodać bez przechodzenia całości.
 *
 * Pokazuje się automatycznie raz na konto (klucz localStorage per userId).
 * Każde zamknięcie — pominięcie, Escape, klik w tło, koniec — zapisuje
 * znacznik, więc tour sam nie wraca; wpis „Przewodnik" w stopce sidebara
 * otwiera go ponownie z każdej strony.
 *
 * Kroki bez istniejącego elementu (np. strona, na której czegoś nie ma) są
 * pomijane, więc tour nie może „utknąć" na pustym pomoście.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
}

export interface SpotlightTourProps {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Mounted only while open, so every opening starts from the first step. */
function SpotlightTour({ userId, onOpenChange }: SpotlightTourProps) {
  const t = useTranslations("walkthrough");
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const finish = useCallback(() => {
    if (userId) markWalkthroughSeen(userId);
    onOpenChange(false);
  }, [userId, onOpenChange]);

  // Steps are collected from the page as it is. The tour can open while the
  // page is still streaming in (a redirect from /start, loading.tsx), so until
  // the person moves past the first step the list follows the DOM; after that
  // it stays put. Each collect is batched into one frame.
  const pastFirstStep = index > 0;
  useEffect(() => {
    if (pastFirstStep) return;
    const collect = () => {
      // Steps whose control isn't on this page, isn't visible (mobile
      // sidebar, collapsed section) or isn't allowed for this role are skipped.
      const all: TourStep[] = [
        { selector: 'a[href="/projects"]', title: t("projectsTitle"), body: t("projectsBody") },
        { selector: '[data-tour="new-task"]', title: t("newTaskTitle"), body: t("newTaskBody") },
        { selector: '[data-tour="board"]', title: t("boardTitle"), body: t("boardBody") },
        { selector: 'a[href^="/projects/"][href$="/decisions"]', title: t("decisionsTitle"), body: t("decisionsBody") },
        { selector: 'a[href^="/projects/"][href$="/files"]', title: t("filesTitle"), body: t("filesBody") },
        { selector: '[data-tour="connect-agent"]', title: t("agentTitle"), body: t("agentBody") },
        { selector: '[data-tour="command"]', title: t("searchTitle"), body: t("searchBody") },
        { selector: '[data-tour="walkthrough"]', title: t("replayTitle"), body: t("replayBody") },
      ];
      const found = all.filter((step) => {
        const el = document.querySelector(step.selector);
        return el instanceof HTMLElement && el.offsetParent !== null;
      });
      setSteps((current) =>
        current.map((step) => step.selector).join() === found.map((step) => step.selector).join() ? current : found
      );
    };
    let raf = requestAnimationFrame(collect);
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(collect);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [pastFirstStep, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  // A click that reaches the highlighted control (through the hole) closes the
  // tour; the control itself handles the click as usual.
  const currentSelector = steps[index]?.selector;
  useEffect(() => {
    if (!currentSelector) return;
    const onClick = (event: MouseEvent) => {
      const target = document.querySelector(currentSelector);
      if (target && event.target instanceof Node && target.contains(event.target)) finish();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [currentSelector, finish]);

  /* Pomiar elementu bieżącego kroku + przewinięcie do niego. */
  useEffect(() => {
    if (steps.length === 0) return;
    if (index > steps.length - 1) {
      // Element zniknął w międzyczasie — zamiast utknąć, domknij tour.
      finish();
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
  }, [steps, index]);

  /* Połóż dymek poniżej podświetlenia, a gdy brakuje miejsca — nad nim. */
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !rect) return;
    const below = rect.top + rect.height + PAD + el.offsetHeight + 12;
    setPlacement(below < window.innerHeight ? "below" : "above");
  }, [rect, index, steps]);

  if (!rect || steps.length === 0) return null;

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
    <div className="pointer-events-none fixed inset-0 z-[100]" data-tour-overlay>
      <div
        aria-hidden
        className="absolute rounded-xl transition-all duration-200"
        style={{
          ...highlight,
          boxShadow: "0 0 0 200vmax hsl(0 0% 0% / 0.65)",
        }}
      />
      {/* Catches clicks on the dimmed backdrop (closes the tour). The hole is cut
          out of it, so a click there reaches the real control natively; the
          capture listener above then closes the tour. */}
      <button
        type="button"
        aria-label={t("skip")}
        className="pointer-events-auto fixed inset-0 cursor-default"
        style={{
          zIndex: -1,
          clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${highlight.left}px ${highlight.top}px, ${highlight.left + highlight.width}px ${highlight.top}px, ${highlight.left + highlight.width}px ${highlight.top + highlight.height}px, ${highlight.left}px ${highlight.top + highlight.height}px, ${highlight.left}px ${highlight.top}px)`,
        }}
        onClick={(event) => {
          // Right after "Next" the hole still sits on the previous step until
          // the next measure, so a quick click on the new control lands here:
          // hand it on when it is over that control (live box), else just close.
          const target = document.querySelector<HTMLElement>(current.selector);
          const box = target?.getBoundingClientRect();
          const onTarget = !!box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
          finish();
          if (onTarget) target?.click();
        }}
      />

      <div
        ref={popoverRef}
        role="dialog"
        aria-label={current.title}
        className="pointer-events-auto fixed w-[min(340px,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-4 shadow-lg"
        style={{ top: popoverTop, bottom: popoverBottom, left: popoverLeft }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{current.title}</h3>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t("stepOf", { step: index + 1, total: steps.length })}
          </p>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{current.body}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
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
            <Button size="sm" onClick={() => (isLast ? finish() : setIndex(index + 1))}>
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
  // The tour renders nothing until it has measured a step, so the server and
  // the first client render match even when this starts out true.
  const [open, setOpen] = useState(() => typeof window !== "undefined" && !!userId && !isWalkthroughSeen(userId));

  return open ? <SpotlightTour userId={userId} onOpenChange={setOpen} /> : null;
}

/** Ręczne uruchomienie: wpis „Przewodnik" w stopce sidebara (wzór: FeedbackMenuItem). */
export function WalkthroughMenuItem({ userId }: { userId: string | null }) {
  const t = useTranslations("walkthrough");
  const [open, setOpen] = useState(false);

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton type="button" tooltip={t("launcher")} onClick={() => setOpen(true)} data-tour="walkthrough">
          <Sparkles className={cn("size-4 shrink-0")} />
          <span>{t("launcher")}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {open && <SpotlightTour userId={userId} onOpenChange={setOpen} />}
    </>
  );
}
