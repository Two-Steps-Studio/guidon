// No imports: loaded by tests/task-import.test.mjs with Node's type stripping.

/**
 * Turns a CSV or JSON export from another tool into tasks for a Guidon
 * board. Pure and dependency-free so it runs in the browser (preview) and
 * in tests; the server action re-validates what it gets.
 *
 * Accepted:
 * - CSV/TSV with a header row (comma, semicolon or tab; RFC 4180 quoting),
 *   with the column names Jira, GitHub, Linear, Asana, Trello (CSV), Notion
 *   and spreadsheets commonly use - see HEADER_ALIASES.
 * - JSON: an array of task objects, `{ "tasks": [...] }`, or a Trello board
 *   export (`cards` + `lists` + `labels`).
 */

export interface ImportedTask {
  title: string;
  description: string | null;
  /** As written in the file - a key or a label; matched to the project's columns by resolveImportedTasks. */
  status: string | null;
  priority: string | null;
  tags: string[];
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
  assignee: string | null;
}

export interface ParseResult {
  tasks: ImportedTask[];
  /** Human-readable problems with the file itself (rows skipped, unknown format). */
  warnings: string[];
  format: "csv" | "json" | "trello";
}

/** At most this many tasks per import - the server action enforces the same cap. */
export const MAX_IMPORT_TASKS = 1000;

type Field = keyof ImportedTask;

const HEADER_ALIASES: Record<Field, string[]> = {
  title: ["title", "name", "summary", "task", "task name", "issue", "subject", "card name", "tytuł", "nazwa", "zadanie"],
  description: ["description", "body", "details", "notes", "desc", "content", "card description", "opis"],
  status: ["status", "state", "list", "list name", "column", "stage", "section/column", "kolumna"],
  priority: ["priority", "importance", "severity", "priorytet"],
  tags: ["labels", "label", "tags", "tag", "etykiety", "tagi"],
  dueDate: ["due", "due date", "due_date", "deadline", "due on", "target date", "termin"],
  assignee: ["assignee", "assigned to", "owner", "assignees", "members", "przypisany", "osoba"],
};

function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, "").trim().toLowerCase().replace(/[_\s]+/g, " ");
}

function fieldForHeader(header: string): Field | null {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function detectDelimiter(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** "a, b; c" or a JSON-ish array -> ["a", "b", "c"]. */
function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(splitList);
  if (value && typeof value === "object" && "name" in value) return splitList((value as { name: unknown }).name);
  if (typeof value !== "string") return [];
  return value
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Accepts ISO dates/times, YYYY/MM/DD, DD.MM.YYYY and DD/MM/YYYY; anything else is dropped. */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return isoDay(+match[1], +match[2], +match[3]);
  match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(text);
  if (match) return isoDay(+match[3], +match[2], +match[1]);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function isoDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function text(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function fromRecord(record: Record<string, unknown>): ImportedTask | null {
  const byField: Partial<Record<Field, unknown>> = {};
  for (const [key, value] of Object.entries(record)) {
    const field = fieldForHeader(key);
    if (field && byField[field] === undefined) byField[field] = value;
  }
  const title = text(byField.title);
  if (!title) return null;
  const assignee = byField.assignee;
  return {
    title: title.slice(0, 500),
    description: text(byField.description),
    status: text(byField.status),
    priority: text(byField.priority),
    tags: [...new Set(splitList(byField.tags))].slice(0, 30),
    dueDate: normalizeDate(byField.dueDate),
    assignee: Array.isArray(assignee) ? text(assignee[0]) : text(assignee),
  };
}

function parseCsv(input: string): ParseResult {
  const firstLine = input.slice(0, input.search(/\r?\n/) === -1 ? undefined : input.search(/\r?\n/));
  const rows = parseCsvRows(input, detectDelimiter(firstLine));
  const warnings: string[] = [];
  if (rows.length < 2) return { tasks: [], warnings: ["The file has no rows below the header."], format: "csv" };
  const header = rows[0];
  if (!header.some((h) => fieldForHeader(h) === "title")) {
    return { tasks: [], warnings: ['No title column found - name one "Title", "Name" or "Summary".'], format: "csv" };
  }
  const tasks: ImportedTask[] = [];
  let skipped = 0;
  for (const cells of rows.slice(1)) {
    const record = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
    const task = fromRecord(record);
    if (task) tasks.push(task);
    else skipped++;
  }
  if (skipped) warnings.push(`${skipped} row(s) without a title were skipped.`);
  return { tasks, warnings, format: "csv" };
}

interface TrelloBoard {
  cards: { name?: string; desc?: string; idList?: string; idLabels?: string[]; due?: string | null; closed?: boolean }[];
  lists?: { id: string; name: string; closed?: boolean }[];
  labels?: { id: string; name: string; color?: string }[];
}

function isTrello(value: unknown): value is TrelloBoard {
  return !!value && typeof value === "object" && Array.isArray((value as TrelloBoard).cards) && Array.isArray((value as TrelloBoard).lists);
}

function parseTrello(board: TrelloBoard): ParseResult {
  const lists = new Map((board.lists ?? []).map((list) => [list.id, list]));
  const labels = new Map((board.labels ?? []).map((label) => [label.id, label.name || label.color || ""]));
  let archived = 0;
  const tasks: ImportedTask[] = [];
  for (const card of board.cards) {
    if (card.closed || (card.idList && lists.get(card.idList)?.closed)) {
      archived++;
      continue;
    }
    const title = text(card.name);
    if (!title) continue;
    tasks.push({
      title: title.slice(0, 500),
      description: text(card.desc),
      status: card.idList ? lists.get(card.idList)?.name ?? null : null,
      priority: null,
      tags: (card.idLabels ?? []).map((id) => labels.get(id) ?? "").filter(Boolean),
      dueDate: normalizeDate(card.due ?? null),
      assignee: null,
    });
  }
  return { tasks, warnings: archived ? [`${archived} archived card(s) were left out.`] : [], format: "trello" };
}

function parseJson(input: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return { tasks: [], warnings: ["This isn't valid JSON."], format: "json" };
  }
  if (isTrello(value)) return parseTrello(value);
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { tasks?: unknown }).tasks)
      ? (value as { tasks: unknown[] }).tasks
      : value && typeof value === "object" && Array.isArray((value as { issues?: unknown }).issues)
        ? (value as { issues: unknown[] }).issues
        : null;
  if (!list) return { tasks: [], warnings: ['Expected a list of tasks, { "tasks": [...] } or a Trello board export.'], format: "json" };
  const tasks: ImportedTask[] = [];
  let skipped = 0;
  for (const item of list) {
    // Jira's REST shape keeps the fields one level down.
    const record =
      item && typeof item === "object" && "fields" in item && typeof (item as { fields: unknown }).fields === "object"
        ? { ...(item as { fields: Record<string, unknown> }).fields }
        : (item as Record<string, unknown>);
    const task = record && typeof record === "object" ? fromRecord(record) : null;
    if (task) tasks.push(task);
    else skipped++;
  }
  return { tasks, warnings: skipped ? [`${skipped} item(s) without a title were skipped.`] : [], format: "json" };
}

export function parseTaskImport(input: string, fileName = ""): ParseResult {
  const trimmed = input.trim();
  const looksJson = /\.json$/i.test(fileName) || trimmed.startsWith("[") || trimmed.startsWith("{");
  const result = looksJson ? parseJson(trimmed) : parseCsv(input);
  if (result.tasks.length > MAX_IMPORT_TASKS) {
    result.warnings.push(`Only the first ${MAX_IMPORT_TASKS} tasks are imported.`);
    result.tasks = result.tasks.slice(0, MAX_IMPORT_TASKS);
  }
  return result;
}

// ---------------------------------------------------------------- mapping

export interface ImportTarget {
  /** The project's visible board columns, in order. */
  columns: { status: string; label: string }[];
  priorities: { key: string; label: string }[];
  members: { id: string; email: string; full_name: string | null }[];
}

export interface ResolvedImportTask {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[];
  dueDate: string | null;
  assigneeId: string | null;
}

/** Common words other tools use, onto Guidon's built-in keys. */
const STATUS_SYNONYMS: Record<string, string> = {
  "to do": "todo",
  open: "todo",
  new: "todo",
  "not started": "backlog",
  icebox: "backlog",
  doing: "in_progress",
  "in progress": "in_progress",
  started: "in_progress",
  "in review": "review",
  "code review": "review",
  testing: "review",
  qa: "review",
  closed: "done",
  completed: "done",
  complete: "done",
  resolved: "done",
  finished: "done",
};

const PRIORITY_SYNONYMS: Record<string, string> = {
  highest: "critical",
  urgent: "critical",
  blocker: "critical",
  p0: "critical",
  p1: "high",
  major: "high",
  normal: "medium",
  p2: "medium",
  minor: "low",
  lowest: "low",
  trivial: "low",
  p3: "low",
};

const squash = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, " ");

function matchKey(
  value: string | null,
  options: { key: string; label: string }[],
  synonyms: Record<string, string>
): string | null {
  if (!value) return null;
  const wanted = squash(value);
  const exact = options.find((o) => squash(o.key) === wanted || squash(o.label) === wanted);
  if (exact) return exact.key;
  const synonym = synonyms[wanted];
  return synonym && options.some((o) => o.key === synonym) ? synonym : null;
}

/**
 * Maps the file's statuses, priorities and assignees onto the project's.
 * A value that matches nothing falls back (first column / medium /
 * unassigned) and is reported once per distinct value, so the preview can
 * say exactly what will change.
 */
export function resolveImportedTasks(
  tasks: ImportedTask[],
  target: ImportTarget
): { tasks: ResolvedImportTask[]; unmatched: { statuses: string[]; priorities: string[]; assignees: string[] } } {
  const columns = target.columns.map((c) => ({ key: c.status, label: c.label }));
  const fallbackStatus = columns.find((c) => c.key === "backlog")?.key ?? columns[0]?.key ?? "backlog";
  const unmatched = { statuses: new Set<string>(), priorities: new Set<string>(), assignees: new Set<string>() };

  const resolved = tasks.map((task) => {
    const status = matchKey(task.status, columns, STATUS_SYNONYMS);
    if (task.status && !status) unmatched.statuses.add(task.status);
    const priority = matchKey(task.priority, target.priorities, PRIORITY_SYNONYMS);
    if (task.priority && !priority) unmatched.priorities.add(task.priority);
    let assigneeId: string | null = null;
    if (task.assignee) {
      const who = squash(task.assignee);
      assigneeId =
        target.members.find((m) => squash(m.email) === who || (m.full_name && squash(m.full_name) === who))?.id ?? null;
      if (!assigneeId) unmatched.assignees.add(task.assignee);
    }
    return {
      title: task.title,
      description: task.description,
      status: status ?? fallbackStatus,
      priority: priority ?? "medium",
      tags: task.tags,
      dueDate: task.dueDate,
      assigneeId,
    };
  });

  return {
    tasks: resolved,
    unmatched: {
      statuses: [...unmatched.statuses],
      priorities: [...unmatched.priorities],
      assignees: [...unmatched.assignees],
    },
  };
}
