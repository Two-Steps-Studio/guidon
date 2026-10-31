/** Fixed event names only: never attach query text, IDs, URLs or a session. */
export const SEARCH_EVENTS = ["results", "zero", "click", "failed"] as const;
export type SearchEvent = typeof SEARCH_EVENTS[number];
export function isSearchEvent(value: unknown): value is SearchEvent {
  return typeof value === "string" && (SEARCH_EVENTS as readonly string[]).includes(value);
}

export interface SearchCounter { day: string | Date; event: string; count: number | string }

/** Eight Monday-based UTC calendar weeks, including the incomplete current week. */
export function weeklySearchCounts(rows: SearchCounter[], now = new Date()) {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return Array.from({length:8}, (_, index) => {
    const start = new Date(monday); start.setUTCDate(start.getUTCDate() - index * 7);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
    const totals = {results:0,zero:0,click:0,failed:0};
    for (const row of rows) {
      const day = new Date(row.day), count = Number(row.count);
      if (day >= start && day < end && isSearchEvent(row.event) && Number.isSafeInteger(count) && count >= 0) totals[row.event] += count;
    }
    const searches = totals.results + totals.zero;
    return {week:start.toISOString().slice(0,10), searches, zero:totals.zero, zeroPercent:searches ? Math.round(totals.zero / searches * 100) : null, clicks:totals.click, failed:totals.failed};
  });
}
