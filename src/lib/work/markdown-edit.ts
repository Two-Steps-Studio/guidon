/**
 * Pure text-editing helpers for the task description toolbar
 * (src/components/work/description-toolbar.tsx): every function takes the
 * current value plus the selection and returns the next value plus the
 * selection to restore - no DOM, so they can be checked without a browser.
 */

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection in `before`/`after` (bold, italic, code), or removes the wrapper when it is already there. */
export function toggleInline(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string
): EditResult {
  const selected = value.slice(start, end);

  const wrappedOutside =
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after;
  if (wrappedOutside) {
    return {
      value: value.slice(0, start - before.length) + selected + value.slice(end + after.length),
      selectionStart: start - before.length,
      selectionEnd: end - before.length,
    };
  }

  const insert = selected || placeholder;
  const next = value.slice(0, start) + before + insert + after + value.slice(end);
  return {
    value: next,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + insert.length,
  };
}

export type LinePrefixKind = "heading" | "bullet" | "numbered" | "task" | "quote";

const PREFIX_PATTERNS: Record<LinePrefixKind, RegExp> = {
  heading: /^#{1,6}\s+/,
  bullet: /^[-*+]\s+(?!\[[ xX]\]\s)/,
  numbered: /^\d+\.\s+/,
  task: /^[-*+]\s+\[[ xX]\]\s+/,
  quote: /^>\s?/,
};

function prefixFor(kind: LinePrefixKind, index: number): string {
  switch (kind) {
    case "heading":
      return "## ";
    case "bullet":
      return "- ";
    case "numbered":
      return `${index + 1}. `;
    case "task":
      return "- [ ] ";
    case "quote":
      return "> ";
  }
}

/**
 * Turns every line touched by the selection into a heading / bullet /
 * numbered / task / quote line. If all of those lines already have that
 * prefix it is removed instead (toggle). Any other list prefix on a line is
 * replaced rather than stacked ("- [ ] " never becomes "- - [ ] ").
 */
export function toggleLinePrefix(value: string, start: number, end: number, kind: LinePrefixKind): EditResult {
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const blockEnd = nextBreak === -1 ? value.length : nextBreak;

  const lines = value.slice(blockStart, blockEnd).split("\n");
  const pattern = PREFIX_PATTERNS[kind];
  const allHave = lines.every((line) => line.trim() === "" || pattern.test(line));
  const anyPrefix = /^(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+|>\s?)/;

  let counter = 0;
  const nextLines = lines.map((line) => {
    if (line.trim() === "" && lines.length > 1) return line;
    if (allHave) return line.replace(pattern, "");
    const stripped = line.replace(anyPrefix, "");
    return prefixFor(kind, counter++) + stripped;
  });

  const replacement = nextLines.join("\n");
  const next = value.slice(0, blockStart) + replacement + value.slice(blockEnd);
  return {
    value: next,
    selectionStart: blockStart,
    selectionEnd: blockStart + replacement.length,
  };
}

/** `[text](url)` around the selection, with the url part selected so it can be typed over. */
export function insertLink(value: string, start: number, end: number): EditResult {
  const text = value.slice(start, end) || "text";
  const url = "https://";
  const next = value.slice(0, start) + `[${text}](${url})` + value.slice(end);
  const urlStart = start + text.length + 3;
  return { value: next, selectionStart: urlStart, selectionEnd: urlStart + url.length };
}

const LIST_LINE = /^(\s*)((?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)(.*)$/;

/**
 * Enter inside a list line continues the list (next bullet, next number, a
 * fresh unchecked task); Enter on an empty list item ends the list. Returns
 * null when the caret is not on a list line, so the browser's normal Enter
 * runs.
 */
export function continueList(value: string, cursor: number): EditResult | null {
  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const lineEnd = value.indexOf("\n", cursor);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const match = LIST_LINE.exec(line);
  if (!match) return null;

  const [, indent, marker, content] = match;
  // Caret before the marker: leave it to the default behaviour.
  if (cursor - lineStart < indent.length + marker.length) return null;

  if (content.trim() === "") {
    const next = value.slice(0, lineStart) + value.slice(lineStart + line.length);
    return { value: next, selectionStart: lineStart, selectionEnd: lineStart };
  }

  let nextMarker = marker;
  const numbered = /^(\d+)\.(\s+)/.exec(marker);
  if (numbered) nextMarker = marker.replace(/^\d+/, String(Number(numbered[1]) + 1));
  nextMarker = nextMarker.replace(/\[[xX]\]/, "[ ]");

  const insert = `\n${indent}${nextMarker}`;
  const next = value.slice(0, cursor) + insert + value.slice(cursor);
  const caret = cursor + insert.length;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}

const TASK_ITEM = /^(\s*[-*+]\s+)\[( |x|X)\]/;

/**
 * Sets the "- [ ]" / "- [x]" checkbox on one source line (0-based, as the
 * markdown parser reports it for the rendered list item). Returns the value
 * unchanged when that line is not a task item.
 */
export function toggleTaskAtLine(value: string, line: number, checked: boolean): string {
  const lines = value.split("\n");
  if (line < 0 || line >= lines.length || !TASK_ITEM.test(lines[line])) return value;
  lines[line] = lines[line].replace(TASK_ITEM, `$1[${checked ? "x" : " "}]`);
  return lines.join("\n");
}
