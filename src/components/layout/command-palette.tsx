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
  adminUserDirectory?: boolean;
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
type SearchOutcome = { results: SearchResult[]; limited: boolean } | "failed";

export function CommandPalette({ currentProjectId, disabledModules, adminUserDirectory }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState({ value: "", version: 0 });
  const [response, setResponse] = useState<{ projectId?: string; version: number; outcome: SearchOutcome }>();
  const router = useRouter();
  const tNav = useTranslations("nav");
  const t = useTranslations("commandPalette");
  const tAdmin = useTranslations("admin.directory");
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
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === "k") {
        event.preventDefault();
        if (event.repeat) return;
        setSearch(previous => ({ value: "", version: previous.version + 1 }));
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

  function changeQuery(value: string) {
    setSearch(previous => ({
      value,
      version: previous.value.trim() === value.trim() ? previous.version : previous.version + 1,
    }));
  }

  function changeOpen(next: boolean) {
    if (!next) changeQuery("");
    setOpen(next);
  }

  const query = search.value.trim();
  const version = search.version;
  const showResults = query.length >= MIN_QUERY_LENGTH;
  const current = response && response.version === version && response.projectId === currentProjectId
    ? response.outcome : undefined;
  const failed = current === "failed";
  const results = current && current !== "failed" ? current.results : [];
  const limited = current && current !== "failed" && current.limited;
  const loading = current === undefined;

  useEffect(() => {
    if (!open || !showResults) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      if (currentProjectId) params.set("project_id", currentProjectId);
      fetch(`/api/v1/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("Search failed");
          return res.json();
        })
        .then((data: { results?: SearchResult[]; diagnostics?: { taskCandidatesLimited?: boolean } }) => {
          if (controller.signal.aborted) return;
          const results = data.results ?? [];
          setResponse({ projectId: currentProjectId, version, outcome: {
            results,
            limited: data.diagnostics?.taskCandidatesLimited === true,
          } });
          countSearchEvent(results.length ? "results" : "zero");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          countSearchEvent("failed");
          setResponse({ projectId: currentProjectId, version, outcome: "failed" });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, currentProjectId, open, showResults, version]);

  function go(href: string) {
    changeOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("triggerLabel")}
        aria-keyshortcuts="Meta+K Control+K"
        // Stabilny uchwyt dla spotlight tour (przewodnik po aplikacji).
        data-tour="command"
        data-slot="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:h-8 md:w-full md:max-w-64 md:shrink"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left md:block">{t("triggerLabel")}</span>
        <CommandShortcut aria-hidden className="ml-0 hidden md:inline">Ctrl / ⌘ K</CommandShortcut>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        title={t("title")}
        description={t("description")}
        shouldFilter={false}
      >
        <CommandInput ref={inputRef} maxLength={200} placeholder={t("placeholder")} value={search.value} onValueChange={changeQuery} />
        <CommandList>
          {showResults ? (
            <>
              {loading && <p role="status" className="p-4 text-sm text-muted-foreground">{t("searching")}</p>}
              {failed && <div className="p-4 text-sm"><p role="alert">{t("searchFailed")}</p><button type="button" className="mt-2 min-h-11 rounded border px-3 py-2" onClick={() => {
                setSearch(previous => ({ ...previous, version: previous.version + 1 }));
                inputRef.current?.focus();
              }}>{t("retry")}</button></div>}
              {!loading && !failed && results.length === 0 && <CommandEmpty><p>{t("noResults")}</p><p className="mt-2 text-xs">{t("noResultsHint")}</p><button type="button" className="mt-3 min-h-11 rounded border px-3 py-2" onClick={() => { changeQuery(""); inputRef.current?.focus(); }}>{t("clearSearch")}</button></CommandEmpty>}
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
                {adminUserDirectory && <CommandItem value="/admin/users" onSelect={() => go("/admin/users")}>
                  <Search />{tAdmin("command")}
                </CommandItem>}
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
