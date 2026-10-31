"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { countSearchEvent } from "./search-metrics";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/layout/keyboard-shortcuts";
import { GLOBAL_NAV, PROJECT_NAV, visibleNavItems } from "@/components/layout/app-sidebar";

interface SearchResult {
  type: string;
  id: string;
  title: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

interface CommandPaletteProps {
  /** Set when the current page is inside a project - scopes search to it
   * and adds that project's own nav (Task Board, Calendar, ...) to the
   * static command list, the same set app-sidebar.tsx shows. */
  currentProjectId?: string;
  /** projects.disabled_modules (migration 055) - hidden sections aren't offered either. */
  disabledModules?: string[];
}

/**
 * Where selecting a search result of each type navigates. Tasks are special
 * (see MIN_QUERY_LENGTH's neighbour below) - they open the task detail
 * dialog in place via a query param, everything else just lands on the
 * list page that contains it (none of these have their own detail route).
 */
function resultHref(result: SearchResult, currentProjectId?: string): string {
  if (result.type === "project") return `/projects/${result.id}`;

  const projectId = (result.metadata.project_id as string | undefined) ?? currentProjectId;
  if (!projectId) return "#";

  switch (result.type) {
    case "task":
      return `/projects/${projectId}/work?openTask=${result.id}`;
    case "decision":
      return `/projects/${projectId}/decisions`;
    case "memory":
      return `/projects/${projectId}/memory`;
    case "file":
      return `/projects/${projectId}/files`;
    case "source":
      return `/projects/${projectId}/knowledge`;
    default:
      return "#";
  }
}

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 200;

export function CommandPalette({ currentProjectId, disabledModules }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [limited, setLimited] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  const tNav = useTranslations("nav");
  const t = useTranslations("commandPalette");
  const entityTypeLabels: Record<string, string> = {
    task: t("entityType_task"),
    decision: t("entityType_decision"),
    memory: t("entityType_memory"),
    file: t("entityType_file"),
    source: t("entityType_source"),
    project: t("entityType_project"),
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    // "/" and other callers (keyboard-shortcuts.tsx) open it with an event.
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  function resetSearch() {
    setQuery("");
    setResults([]);
    setLimited(false);
    setLoading(false);
    setFailed(false);
  }

  // Reset on close so reopening never flashes the previous search.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetSearch();
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLimited(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setResults([]);
    setLimited(false);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      if (currentProjectId) params.set("project_id", currentProjectId);
      fetch(`/api/v1/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => { if (!res.ok) throw new Error("Search failed");return res.json(); })
        .then((data: { results?: SearchResult[]; diagnostics?: {taskCandidatesLimited?: boolean} }) => { if (!controller.signal.aborted) { setResults(data.results ?? []); countSearchEvent(data.results?.length ? "results" : "zero"); setLimited(data.diagnostics?.taskCandidatesLimited === true); } })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          countSearchEvent("failed");
          setFailed(true);setResults([]);
          setLimited(false);
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, currentProjectId, open, retry]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const showResults = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <>
      <button
        type="button"
        aria-label={`${t("triggerLabel")} ⌘K`}
        aria-keyshortcuts="Meta+K Control+K"
        data-slot="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:w-full md:max-w-64 md:shrink"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left md:block">{t("triggerLabel")}</span>
        {" "}<CommandShortcut aria-hidden className="ml-0 hidden md:inline">⌘K</CommandShortcut>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        shouldFilter={false}
      >
        <CommandInput ref={inputRef} maxLength={200} placeholder={t("placeholder")} value={query} onValueChange={setQuery} />
        <CommandList>
          {showResults ? (
            <>
              {loading && <p role="status" className="p-4 text-sm text-muted-foreground">{t("searching")}</p>}
              {failed && <div className="p-4 text-sm"><p role="alert">{t("searchFailed")}</p><button className="mt-2 rounded border px-3 py-2" onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></div>}
              {!loading && !failed && results.length === 0 && <CommandEmpty><p>{t("noResults")}</p><p className="mt-2 text-xs">{t("noResultsHint")}</p><button type="button" className="mt-3 rounded border px-3 py-2" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>{t("clearSearch")}</button></CommandEmpty>}
              {!loading && !failed && limited && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">{t("limitedResults")}</p>}
              {results.length > 0 && results.every((result) => result.metadata.match === "fuzzy") && (
                <p role="status" className="px-4 pt-3 text-xs text-muted-foreground">{t("closestMatches")}</p>
              )}
              {results.length > 0 && (
                <CommandGroup heading={t("resultsGroup")}>
                  {results.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => { countSearchEvent("click"); go(resultHref(result, currentProjectId)); }}
                    >
                      <span className="flex-1 truncate">{result.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entityTypeLabels[result.type] ?? result.type}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              <CommandGroup heading={t("navigateGroup")}>
                {GLOBAL_NAV.map((item) => (
                  <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)}>
                    <item.icon />
                    {tNav(item.labelKey)}
                  </CommandItem>
                ))}
              </CommandGroup>
              {currentProjectId &&
                // Nested per-group, not a pre-flattened array: PROJECT_NAV's
                // groups each have their own distinct literal tuple type
                // (from `as const satisfies ProjectNavGroup[]`, see its own
                // doc comment in app-sidebar.tsx) so labelKey stays a real
                // next-intl message key here, the same way app-sidebar.tsx
                // itself renders this data - flattening first widens
                // labelKey to plain `string` and next-intl's typed t()
                // rejects that.
                PROJECT_NAV.map((group, groupIndex) => {
                  const items = visibleNavItems(group.items, disabledModules);
                  if (items.length === 0) return null;
                  return (
                  <CommandGroup
                    key={group.labelKey ?? `project-group-${groupIndex}`}
                    heading={group.labelKey ? tNav(group.labelKey) : undefined}
                  >
                    {items.map((item) => (
                      <CommandItem
                        key={item.href}
                        value={item.href || "overview"}
                        onSelect={() => go(`/projects/${currentProjectId}/${item.href}`)}
                      >
                        <item.icon />
                        {tNav(item.labelKey)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  );
                })}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
