"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { SpotlightTour } from "@/components/layout/walkthrough-tour";
import { Gido } from "./gido";

/** Which set of tips a page gets (messages: companion.tips.<key>). */
type TipKey = "dashboard" | "myTasks" | "overview" | "board" | "decisions" | "memory" | "profile" | "general";

function tipKeyFor(pathname: string): TipKey {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname === "/my-tasks") return "myTasks";
  if (pathname.startsWith("/profile")) return "profile";
  const project = /^\/projects\/[^/]+(\/[^/]+)?/.exec(pathname);
  if (project) {
    if (!project[1]) return "overview";
    if (project[1] === "/work") return "board";
    if (project[1] === "/decisions") return "decisions";
    if (project[1] === "/memory") return "memory";
  }
  return "general";
}

// Per-viewer conveniences only (CLAUDE.md: never state that must persist).
const SLEEP_KEY = "guidon.companion.sleeping.v1";
const SEEN_KEY = "guidon.companion.seen.v1";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: Gido just forgets between visits.
  }
}

// Storage as an external store: the server (and hydration) render the
// defaults, the browser then reads the saved state - no mismatch.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function save(key: string, value: string | null) {
  writeStorage(key, value);
  listeners.forEach((listener) => listener());
}

/**
 * Gido stays in the corner of the app on every page: a dot when it has a
 * tip for the page you're on, a click for that tip or the guided tour.
 * It never pops up on its own; it can be put to sleep and woken again.
 */
export function Companion({ userId }: { userId: string | null }) {
  const t = useTranslations("companion");
  const pathname = usePathname() ?? "/";
  const { state, isMobile } = useSidebar();
  const key = tipKeyFor(pathname);
  const tips = t.raw(`tips.${key}`) as string[];

  const sleeping = useSyncExternalStore(subscribe, () => readStorage(SLEEP_KEY) === "1", () => false);
  // null on the server: nothing is known yet, so no dot.
  const seenRaw = useSyncExternalStore(subscribe, () => readStorage(SEEN_KEY) ?? "", () => null);
  const seen = seenRaw === null ? null : seenRaw.split(",").filter(Boolean);
  const [open, setOpen] = useState(false);
  // The tip index belongs to the page it was shown on; a new page starts at 0.
  const [tipState, setTipState] = useState({ key, index: 0 });
  const tip = tipState.key === key ? tipState.index : 0;
  const [tourOpen, setTourOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    bubbleRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    if (!open && seen && !seen.includes(key)) save(SEEN_KEY, [...seen, key].join(","));
    setOpen((value) => !value);
  };

  const setSleep = (value: boolean) => {
    save(SLEEP_KEY, value ? "1" : null);
    if (value) close();
  };

  const hasNews = !!seen && !sleeping && !seen.includes(key);
  const mood = sleeping ? "sleepy" : open ? "happy" : "awake";
  // Beside the sidebar, never on top of it (the AI chat owns the right corner).
  const left = isMobile ? "1rem" : state === "collapsed" ? "calc(var(--sidebar-width-icon) + 1rem)" : "calc(var(--sidebar-width) + 1rem)";

  return (
    <>
      <div className="fixed z-40 flex flex-col items-start gap-2" style={{ left, bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {open && (
          <div
            ref={bubbleRef}
            role="dialog"
            aria-labelledby={titleId}
            className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <p id={titleId} className="text-sm font-semibold">{t("name")}</p>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-2 size-8" aria-label={t("close")} onClick={close}>
                <X />
              </Button>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground" aria-live="polite">
              {sleeping ? t("sleepingNote") : tips[tip % tips.length]}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sleeping ? (
                <Button size="sm" onClick={() => setSleep(false)}>{t("wake")}</Button>
              ) : (
                <>
                  {tips.length > 1 && (
                    <Button size="sm" variant="outline" onClick={() => setTipState({ key, index: tip + 1 })}>{t("nextTip")}</Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      setTourOpen(true);
                    }}
                  >
                    {t("tour")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSleep(true)}>{t("sleep")}</Button>
                </>
              )}
            </div>
          </div>
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={hasNews ? t("buttonNews") : t("button")}
          className="relative size-14 rounded-full transition-transform duration-100 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Gido mood={mood} className="size-full drop-shadow-sm" />
          {hasNews && <span aria-hidden className="absolute right-1 top-1 size-3 rounded-full border-2 border-background bg-primary" />}
        </button>
      </div>
      {tourOpen && <SpotlightTour userId={userId} onOpenChange={setTourOpen} />}
    </>
  );
}
