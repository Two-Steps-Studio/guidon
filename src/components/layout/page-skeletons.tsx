import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Building blocks for route-level loading.tsx files. Each page's skeleton
 * is put together from these in the shape of that page - same container
 * width, same header, cards where the page has cards - so the content
 * replaces it in place instead of jumping. Server-safe (no client hooks):
 * useTranslations works in Server Components too.
 */

/** Wrapper with the page's container classes and the status role. */
export function SkeletonPage({ className, children }: { className?: string; children: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <div role="status" aria-busy="true" className={cn("container mx-auto px-6 py-8", className)}>
      <span className="sr-only">{t("loading")}</span>
      {children}
    </div>
  );
}

/** Page title + subtitle, optionally with buttons on the right. */
export function SkeletonHeader({ actions = 0, className }: { actions?: number; className?: string }) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-[70vw]" />
      </div>
      {actions > 0 && (
        <div className="flex max-w-full flex-wrap gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-9 w-32" />
          ))}
        </div>
      )}
    </div>
  );
}

/** A bordered card like the real ones, with a few text lines inside. */
export function SkeletonCard({ lines = 2, className, children }: { lines?: number; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6", className)}>
      {children ?? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/2" />
          {Array.from({ length: lines }, (_, i) => (
            <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Small stat cards (label, big number, caption). */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("mb-8 grid grid-cols-1 gap-4 md:grid-cols-2", count >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} className="p-5">
          <div className="space-y-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6, columns = 3, lines = 2 }: { count?: number; columns?: 2 | 3 | 4; lines?: number }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4"
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

/** Rows inside one card: an icon/avatar, a title and a meta line each. */
export function SkeletonList({ rows = 6, avatar = false, className }: { rows?: number; avatar?: boolean; className?: string }) {
  return (
    <div className={cn("divide-y divide-border rounded-xl border border-border bg-card", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className={cn("h-8 w-8 shrink-0", avatar && "rounded-full")} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Label + field pairs inside a card, then a button. */
export function SkeletonForm({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <SkeletonCard className={className}>
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </SkeletonCard>
  );
}

/** Kanban: toolbar, then columns of task cards with uneven heights. */
export function SkeletonBoard({ columns = 5 }: { columns?: number }) {
  const cardsPerColumn = [3, 2, 4, 1, 2, 1];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="flex items-start gap-4 overflow-hidden">
        {Array.from({ length: columns }, (_, column) => (
          <div key={column} className="w-72 shrink-0 rounded-xl border border-border bg-card/60 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-4 w-6" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: cardsPerColumn[column % cardsPerColumn.length] }, (_, card) => (
                <div key={card} className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <Skeleton className="h-4" style={{ width: `${60 + ((column + card * 13) % 35)}%` }} />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-5 w-5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Month view: month label with arrows, weekday header and 5 weeks. */
export function SkeletonCalendar() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-10" />
          <Skeleton className="h-9 w-10" />
        </div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={`h${i}`} className="flex h-7 items-center justify-center border-b border-border bg-muted/40">
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="h-24 border-b border-r border-border bg-card/60 p-2 md:h-32">
            <Skeleton className="h-3 w-4" />
            {i % 9 === 4 && <Skeleton className="mt-3 h-3 w-full" />}
            {i % 9 === 4 && <Skeleton className="mt-1.5 h-3 w-3/4" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Roadmap: phases as rows on a timeline. */
export function SkeletonTimeline({ phases = 4 }: { phases?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: phases }, (_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton className="h-4 w-4 rounded-full" />
            {i < phases - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <SkeletonCard className="flex-1 p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          </SkeletonCard>
        </div>
      ))}
    </div>
  );
}
