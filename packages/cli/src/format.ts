/** Plain-text table: padded columns, the last column truncated to fit `width`. */
export function table(headers: string[], rows: string[][], width?: number): string {
  if (rows.length === 0) return "";
  const all = [headers, ...rows].map((row) => row.map((cell) => cell.replace(/[\r\n\t]+/g, " ")));
  const widths = headers.map((_, i) => Math.max(...all.map((row) => (row[i] ?? "").length)));
  const lastIndex = headers.length - 1;
  if (width && width > 0) {
    const fixed = widths.slice(0, lastIndex).reduce((sum, w) => sum + w + 2, 0);
    widths[lastIndex] = Math.max(10, Math.min(widths[lastIndex] ?? 0, width - fixed));
  }
  return all
    .map((row) =>
      row
        .map((cell, i) => {
          const w = widths[i] ?? 0;
          const fitted = cell.length > w ? `${cell.slice(0, Math.max(0, w - 1))}…` : cell;
          return i === lastIndex ? fitted : fitted.padEnd(w);
        })
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
