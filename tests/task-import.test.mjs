/**
 * Task import parsing and mapping (src/lib/work/task-import.ts) - CSV/JSON
 * exports from other tools onto a project's columns and priorities.
 * task-import.ts has no imports, so Node's built-in type stripping runs it.
 */
import { findDuplicateTitles, normalizeDate, parseCsvRows, parseTaskImport, resolveImportedTasks, titleKey } from "../src/lib/work/task-import.ts";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

// CSV basics
{
  const rows = parseCsvRows('a,b\n"x, y","say ""hi""\nnext line"\n', ",");
  check("quoted comma, doubled quote and newline inside quotes", rows[1][0] === "x, y" && rows[1][1] === 'say "hi"\nnext line', JSON.stringify(rows));
}
{
  const jira = "Summary;Status;Priority;Labels;Due date;Assignee\nLogin crash;In Progress;Highest;bug,auth;2026-11-03;ann@example.com\n;Done;Low;;;\n";
  const result = parseTaskImport(jira, "jira.csv");
  check("semicolon CSV with Jira headers", result.tasks.length === 1 && result.tasks[0].title === "Login crash", JSON.stringify(result));
  check("labels split", JSON.stringify(result.tasks[0].tags) === '["bug","auth"]');
  check("row without title skipped and reported", result.warnings.some((w) => w.includes("1 row")));
}
{
  const result = parseTaskImport("Foo,Bar\n1,2\n");
  check("no title column -> clear warning", result.tasks.length === 0 && /title column/.test(result.warnings[0]));
}
// JSON
{
  const result = parseTaskImport(JSON.stringify({ tasks: [{ name: "A", status: "todo", tags: ["x"] }, { title: "" }] }));
  check("JSON {tasks: [...]}", result.tasks.length === 1 && result.tasks[0].title === "A" && result.tasks[0].tags[0] === "x");
}
{
  const trello = {
    lists: [{ id: "l1", name: "Doing" }, { id: "l2", name: "Old", closed: true }],
    labels: [{ id: "g", name: "design" }],
    cards: [
      { name: "Card", desc: "d", idList: "l1", idLabels: ["g"], due: "2026-12-01T12:00:00.000Z" },
      { name: "Gone", idList: "l2" },
      { name: "Archived", idList: "l1", closed: true },
    ],
  };
  const result = parseTaskImport(JSON.stringify(trello), "board.json");
  check("Trello export", result.format === "trello" && result.tasks.length === 1 && result.tasks[0].status === "Doing" && result.tasks[0].tags[0] === "design");
  check("Trello archived left out and reported", result.warnings[0]?.includes("2 archived"));
}
{
  const result = parseTaskImport("not json {", "x.json");
  check("broken JSON reported", result.tasks.length === 0 && /valid JSON/.test(result.warnings[0]));
}
// Dates
check("ISO date", normalizeDate("2026-11-03T10:00:00Z") === "2026-11-03");
check("DD.MM.YYYY", normalizeDate("03.11.2026") === "2026-11-03");
check("garbage date dropped", normalizeDate("soon") === null);

// Mapping
{
  const target = {
    columns: [
      { status: "backlog", label: "Backlog" },
      { status: "todo", label: "Todo" },
      { status: "in_progress", label: "In Progress" },
      { status: "qa", label: "QA" },
      { status: "done", label: "Done" },
    ],
    priorities: [
      { key: "blocker", label: "Blocker" },
      { key: "critical", label: "Critical" },
      { key: "high", label: "High" },
      { key: "medium", label: "Medium" },
      { key: "low", label: "Low" },
    ],
    members: [{ id: "u1", email: "ann@example.com", full_name: "Ann Lee" }],
  };
  const parsed = parseTaskImport(
    "Title,Status,Priority,Assignee\nA,In Progress,Highest,ann@example.com\nB,qa,blocker,Ann Lee\nC,Waiting,Whatever,bob@x.com\nD,Closed,minor,\n"
  ).tasks;
  const { tasks, unmatched } = resolveImportedTasks(parsed, target);
  check("label match + priority synonym", tasks[0].status === "in_progress" && tasks[0].priority === "critical" && tasks[0].assigneeId === "u1", JSON.stringify(tasks[0]));
  check("custom column and priority by key; assignee by name", tasks[1].status === "qa" && tasks[1].priority === "blocker" && tasks[1].assigneeId === "u1");
  check("unknown values fall back", tasks[2].status === "backlog" && tasks[2].priority === "medium" && tasks[2].assigneeId === null);
  check("status synonym (Closed -> done)", tasks[3].status === "done" && tasks[3].priority === "low");
  check(
    "unmatched values reported once each",
    JSON.stringify(unmatched) === JSON.stringify({ statuses: ["Waiting"], priorities: ["Whatever"], assignees: ["bob@x.com"] }),
    JSON.stringify(unmatched)
  );
}

// Duplicates: re-importing the same export shouldn't double the board
{
  check("titles compare without case or extra spaces", titleKey("  Fix   LOGIN ") === titleKey("fix login"));
  const { onBoard, inFile } = findDuplicateTitles(
    [{ title: "Fix login" }, { title: "New thing" }, { title: "new  thing" }, { title: "FIX LOGIN" }],
    ["fix login", "Other"]
  );
  check("a title already on the board is marked", onBoard.has(0) && onBoard.has(3), JSON.stringify([...onBoard]));
  check("a repeat inside the file is marked once, the first copy kept", !inFile.has(1) && inFile.has(2) && inFile.size === 1, JSON.stringify([...inFile]));
  check("nothing on an empty board", findDuplicateTitles([{ title: "a" }], []).onBoard.size === 0);
}

// Acceptance: a 100-task export keeps every description, status and due date
{
  const statuses = ["Backlog", "Todo", "In Progress", "In Review", "Done"];
  const lines = ["Title,Description,Status,Priority,Due Date"];
  for (let i = 1; i <= 100; i++) {
    const description = `Step ${i}: "quoted", with comma\nand a second line`;
    lines.push([`Task ${i}`, `"${description.replace(/"/g, '""')}"`, statuses[i % 5], i % 2 ? "High" : "Low", `2026-12-${String((i % 28) + 1).padStart(2, "0")}`].join(","));
  }
  const parsed = parseTaskImport(lines.join("\n"), "linear.csv");
  const { tasks } = resolveImportedTasks(parsed.tasks, {
    columns: [{ status: "backlog", label: "Backlog" }, { status: "todo", label: "Todo" }, { status: "in_progress", label: "In Progress" }, { status: "review", label: "Review" }, { status: "done", label: "Done" }],
    priorities: [{ key: "low", label: "Low" }, { key: "medium", label: "Medium" }, { key: "high", label: "High" }],
    members: [],
  });
  check("all 100 tasks read", tasks.length === 100, String(tasks.length));
  check("every multi-line description kept exactly", tasks.every((task, i) => task.description === `Step ${i + 1}: "quoted", with comma\nand a second line`));
  const expected = ["backlog", "todo", "in_progress", "review", "done"];
  check("every status lands on its column", tasks.every((task, i) => task.status === expected[(i + 1) % 5]), JSON.stringify(tasks.slice(0, 5).map((t) => t.status)));
  check("every due date kept", tasks.every((task, i) => task.dueDate === `2026-12-${String(((i + 1) % 28) + 1).padStart(2, "0")}`));
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
