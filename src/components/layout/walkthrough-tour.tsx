"use client";

/**
 * Przewodnik po aplikacji (spotlight tour): jedna stała trasa przez całą
 * aplikację - pulpit, moje zadania, projekty, tablica, decyzje, pamięć,
 * pliki, organizacje - przechodząca sama między stronami. Podświetla
 * prawdziwe elementy interfejsu (otwór w przyciemnionej zasłonie), a dymek
 * z Gido płynnie przesuwa się od kroku do kroku.
 *
 * AppShell montuje się na każdej stronie od nowa, więc postęp trasy żyje
 * w sessionStorage, a prowadzi ją jeden komponent: WalkthroughAutoOpen.
 * Launchery (sidebar, Gido) tylko ją startują przez startWalkthrough().
 *
 * Pokazuje się automatycznie raz na konto (klucz localStorage per userId);
 * każde zamknięcie zapisuje znacznik. Kroki projektu są pomijane, gdy konto
 * nie ma jeszcze projektu; brakujący element (np. ukryty sidebar na
 * telefonie) daje dymek na środku zamiast utknięcia.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Gido } from "@/components/companion/gido";
import { cn } from "@/lib/utils";

/** `guidon.walkthrough.seen.v1:<userId>` - wersjonowany, bo trasa się zmienia. */
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
    // Tryb prywatny itp. - bez znacznika tour wróci, to tylko UX.
  }
}

type Rect = { top: number; left: number; width: number; height: number };

/** Progress of a running tour; survives the page changes the tour makes. */
interface TourState {
  /** First page step of this run (the page it opened on); null = not chosen yet. */
  start: number | null;
  /** Position along the route (routeOrder), not an index into STEPS. */
  index: number;
  projectId: string | null;
  /** Where the highlight was, so the next page's tour slides on from there. */
  rect: Rect | null;
}

const STATE_KEY = "guidon.walkthrough.run.v2";
const START_EVENT = "guidon:walkthrough-start";

function readState(): TourState | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    const state = raw ? (JSON.parse(raw) as TourState) : null;
    const valid =
      state &&
      Number.isInteger(state.index) && state.index >= 0 && state.index < STEPS.length &&
      (state.start === null || (Number.isInteger(state.start) && state.start >= 0 && state.start < PAGE_STEPS));
    return valid ? state : null;
  } catch {
    return null;
  }
}

function writeState(state: TourState | null): void {
  try {
    if (state) window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(STATE_KEY);
  } catch {
    // Blocked storage: the tour still runs, it just restarts after a page change.
  }
}

/** Starts the tour on the page the person is on, from any page. */
export function startWalkthrough(): void {
  writeState(FIRST_STEP);
  window.dispatchEvent(new Event(START_EVENT));
}

/** Odstęp podświetlenia od elementu i od dymka. */
const PAD = 8;
const GAP = 10;
const POPOVER_WIDTH = 340;

type StepKey =
  | "dashboard"
  | "myTasks"
  | "projects"
  | "board"
  | "newTask"
  | "agent"
  | "decisions"
  | "memory"
  | "files"
  | "organizations"
  | "search"
  | "replay";

interface TourStep {
  key: StepKey;
  /** Page the step lives on; null = whatever page the tour is on. */
  path: ((projectId: string) => string) | string | null;
  selector: (projectId: string) => string;
  needsProject?: boolean;
}

/** The sidebar entry for a page (the logo also links to /dashboard). */
const navLink = (href: string) => `a[data-sidebar="menu-button"][href="${href}"]`;

const STEPS: TourStep[] = [
  { key: "dashboard", path: "/dashboard", selector: () => navLink("/dashboard") },
  { key: "myTasks", path: "/my-tasks", selector: () => navLink("/my-tasks") },
  { key: "projects", path: "/projects", selector: () => navLink("/projects") },
  { key: "board", path: (p) => `/projects/${p}/work`, selector: () => '[data-tour="board"]', needsProject: true },
  { key: "newTask", path: (p) => `/projects/${p}/work`, selector: () => '[data-tour="new-task"]', needsProject: true },
  { key: "agent", path: (p) => `/projects/${p}/work`, selector: () => '[data-tour="connect-agent"]', needsProject: true },
  { key: "decisions", path: (p) => `/projects/${p}/decisions`, selector: (p) => navLink(`/projects/${p}/decisions`), needsProject: true },
  { key: "memory", path: (p) => `/projects/${p}/memory`, selector: (p) => navLink(`/projects/${p}/memory`), needsProject: true },
  { key: "files", path: (p) => `/projects/${p}/files`, selector: (p) => navLink(`/projects/${p}/files`), needsProject: true },
  { key: "organizations", path: "/organizations", selector: () => navLink("/organizations") },
  { key: "search", path: null, selector: () => '[data-tour="command"]' },
  { key: "replay", path: null, selector: () => '[data-tour="walkthrough"]' },
];

/** The steps that open a page; search and replay always close the route. */
const PAGE_STEPS = STEPS.length - 2;

/** The whole route, starting at `start` and going round to the steps before it. */
function routeOrder(start: number): number[] {
  const pages = Array.from({ length: PAGE_STEPS }, (_, i) => i);
  return [...pages.slice(start), ...pages.slice(0, start), PAGE_STEPS, PAGE_STEPS + 1];
}

/** The project open at `pathname`, if any. */
function projectInPath(pathname: string): string | null {
  return /^\/projects\/([0-9a-f-]{36})(\/|$)/.exec(pathname)?.[1] ?? null;
}

/** The first step on the page the tour opens on (-1: a page off the route). */
function startFor(pathname: string): number {
  const projectId = projectInPath(pathname);
  return STEPS.slice(0, PAGE_STEPS).findIndex((step) => stepPath(step, projectId) === pathname);
}

function stepPath(step: TourStep, projectId: string | null): string | null {
  if (typeof step.path === "function") return projectId ? step.path(projectId) : null;
  return step.path;
}

/** The project the tour shows: the one open now, else the first on the projects list. */
function findProjectId(pathname: string): string | null {
  const open = projectInPath(pathname);
  if (open) return open;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('main a[href^="/projects/"]')) {
    const match = /^\/projects\/([0-9a-f-]{36})$/.exec(link.getAttribute("href") ?? "");
    if (match) return match[1];
  }
  return null;
}

function visibleElement(selector: string): HTMLElement | null {
  const el = document.querySelector(selector);
  return el instanceof HTMLElement && el.offsetParent !== null ? el : null;
}

interface SpotlightTourProps {
  userId: string | null;
  initial: TourState;
  onClose: () => void;
}

function SpotlightTour({ userId, initial, onClose }: SpotlightTourProps) {
  const t = useTranslations("walkthrough");
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [start] = useState(() => initial.start ?? Math.max(0, startFor(pathname)));
  const [index, setIndex] = useState(initial.index);
  const [projectId, setProjectId] = useState(() => initial.projectId ?? projectInPath(pathname));
  // True while the tour itself opens the step's page; a run launched by hand
  // (start not chosen yet) may open its first step's page.
  const moving = useRef(initial.start === null);
  // `smooth`: slide to the new box (a step change), not while following a scroll.
  const [view, setView] = useState<{ rect: Rect | null; smooth: boolean; found: boolean }>({
    rect: initial.rect,
    smooth: true,
    found: !!initial.rect,
  });
  const [popoverHeight, setPopoverHeight] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const order = routeOrder(start);
  const step = STEPS[order[Math.min(index, order.length - 1)]];
  const path = stepPath(step, projectId);
  const selector = step.selector(projectId ?? "");
  const onPage = path === null || path === pathname;

  const finish = useCallback(() => {
    if (userId) markWalkthroughSeen(userId);
    writeState(null);
    onClose();
  }, [userId, onClose]);

  useEffect(() => {
    writeState({ start, index, projectId, rect: view.rect });
  }, [start, index, projectId, view.rect]);

  // Off the step's page: open it when the tour moved on, otherwise the person
  // went somewhere themselves, and the tour steps aside instead of pulling them back.
  useEffect(() => {
    if (onPage) moving.current = false;
    else if (moving.current && path) router.push(path);
    else finish();
  }, [onPage, path, router, finish]);

  /** Moves by `direction`, skipping project steps when there is no project. */
  const go = (direction: 1 | -1) => {
    const project = projectId ?? findProjectId(pathname);
    let next = index + direction;
    while (next >= 0 && next < order.length && STEPS[order[next]].needsProject && !project) next += direction;
    if (next < 0) return;
    if (next >= order.length) return finish();
    setProjectId(project);
    moving.current = true;
    setIndex(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  // A click that reaches the highlighted control (through the hole) closes the
  // tour; the control itself handles the click as usual.
  useEffect(() => {
    if (!onPage || !view.found) return;
    const onClick = (event: MouseEvent) => {
      const target = document.querySelector(selector);
      if (target && event.target instanceof Node && target.contains(event.target)) finish();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [onPage, view.found, selector, finish]);

  // Wait for the step's element (the page may still be streaming in), then
  // follow it. Not there after a few seconds: the bubble waits in the middle.
  useEffect(() => {
    if (!onPage) return;
    let tries = 0;
    let element: HTMLElement | null = null;
    let settle = 0;
    const measure = (smooth: boolean) => {
      if (!element) return;
      const box = element.getBoundingClientRect();
      setView({ rect: { top: box.top, left: box.left, width: box.width, height: box.height }, smooth, found: true });
    };
    const follow = () => requestAnimationFrame(() => measure(false));
    const poll = window.setInterval(() => {
      element = visibleElement(selector);
      if (element) {
        window.clearInterval(poll);
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
        measure(true);
        // Again once the page has settled (fonts, streamed sections above it).
        settle = window.setTimeout(() => measure(true), 400);
        window.addEventListener("scroll", follow, { capture: true, passive: true });
        window.addEventListener("resize", follow);
      } else if (++tries > 40) {
        window.clearInterval(poll);
        setView({ rect: null, smooth: true, found: false });
      }
    }, 100);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(settle);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [onPage, selector]);

  // The bubble's height follows its text, so it is measured once per step.
  useLayoutEffect(() => {
    if (popoverRef.current) setPopoverHeight(popoverRef.current.offsetHeight);
  }, [step.key]);

  // Until the tour is past the projects step it can't know there is no project.
  const noProject = !projectId && index > order.findIndex((i) => STEPS[i].needsProject);
  const total = order.filter((i) => !STEPS[i].needsProject || !noProject).length;
  const shown = order.slice(0, index + 1).filter((i) => !STEPS[i].needsProject || projectId).length;
  const isLast = index === order.length - 1;

  // No box yet (or none on this page): a zero-size hole in the middle, so the
  // backdrop still dims and the bubble sits centred.
  const viewportW = typeof window === "undefined" ? 0 : window.innerWidth;
  const viewportH = typeof window === "undefined" ? 0 : window.innerHeight;
  const highlight = view.rect
    ? { top: view.rect.top - PAD, left: view.rect.left - PAD, width: view.rect.width + PAD * 2, height: view.rect.height + PAD * 2 }
    : { top: viewportH / 2, left: viewportW / 2, width: 0, height: 0 };

  const below = highlight.top + highlight.height + GAP;
  const popoverTop = !view.rect
    ? viewportH / 2 - popoverHeight / 2
    : below + popoverHeight + 12 < viewportH
      ? below
      : Math.max(12, highlight.top - GAP - popoverHeight);
  const popoverLeft = Math.min(
    Math.max(12, highlight.left + highlight.width / 2 - POPOVER_WIDTH / 2),
    Math.max(12, viewportW - POPOVER_WIDTH - 12)
  );
  const motion = view.smooth ? "transition-all duration-300 ease-out motion-reduce:transition-none" : "";

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" data-tour-overlay>
      <div
        aria-hidden
        className={cn("absolute rounded-xl", motion)}
        style={{ ...highlight, boxShadow: "0 0 0 200vmax hsl(0 0% 0% / 0.65)" }}
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
        onClick={finish}
      />

      <div
        ref={popoverRef}
        role="dialog"
        aria-label={t(`${step.key}Title`)}
        className={cn(
          "pointer-events-auto fixed left-0 top-0 w-[min(340px,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-4 shadow-lg",
          motion
        )}
        style={{ transform: `translate(${popoverLeft}px, ${popoverTop}px)` }}
      >
        <div className="flex items-start gap-3">
          <Gido mood={isLast ? "happy" : "awake"} className="size-10 shrink-0" />
          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{t(`${step.key}Title`)}</h3>
              <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {t("stepOf", { step: shown, total })}
              </p>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`${step.key}Body`)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => go(-1)}>
              {t("back")}
            </Button>
            <Button size="sm" onClick={() => go(1)}>
              {isLast ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The one place a tour runs: in the app shell of every page. Opens on its
 * own once per account, resumes a tour in progress after a page change, and
 * starts one when a launcher calls startWalkthrough().
 */
export function WalkthroughAutoOpen({ userId }: { userId: string | null }) {
  const pathname = usePathname() ?? "/";
  // Storage is read only after hydration (server and first render show nothing).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [run, setRun] = useState<{ id: number; state: TourState } | null | undefined>(undefined);

  useEffect(() => {
    const onStart = () => setRun((current) => ({ id: (current?.id ?? 0) + 1, state: readState() ?? FIRST_STEP }));
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);

  const close = useCallback(() => setRun(null), []);
  if (!hydrated || !userId) return null;
  // undefined = nothing decided yet on this page: resume a tour in progress, or the first one.
  const current = run === undefined ? initialRun(userId, pathname) : run;
  return current ? <SpotlightTour key={current.id} userId={userId} initial={current.state} onClose={close} /> : null;
}

const FIRST_STEP: TourState = { start: null, index: 0, projectId: null, rect: null };
const noSubscribe = () => () => {};

function initialRun(userId: string, pathname: string): { id: number; state: TourState } | null {
  const saved = readState();
  if (saved) return { id: 0, state: saved };
  // The first tour opens by itself only on a page of the route, and starts
  // there: it never moves a new account off the page it landed on.
  const start = startFor(pathname);
  return isWalkthroughSeen(userId) || start < 0 ? null : { id: 0, state: { ...FIRST_STEP, start } };
}

/** Ręczne uruchomienie: wpis „Przewodnik" w stopce sidebara (wzór: FeedbackMenuItem). */
export function WalkthroughMenuItem() {
  const t = useTranslations("walkthrough");
  return (
    <SidebarMenuItem>
      <SidebarMenuButton type="button" tooltip={t("launcher")} onClick={startWalkthrough} data-tour="walkthrough">
        <Sparkles className="size-4 shrink-0" />
        <span>{t("launcher")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
