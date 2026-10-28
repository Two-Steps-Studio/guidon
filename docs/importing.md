# Moving tasks into Guidon

Work → **Import** adds tasks from another tool to a project's board. It never
changes or removes what is already there. The code is in
`src/lib/work/task-import.ts` (reading and mapping, run in the browser) and
`src/app/projects/[id]/work/import-tasks-actions.ts` (writing; every value is
checked again on the server).

## What it reads

- **CSV or TSV** with a header row: comma, semicolon or tab, standard quoting,
  so a multi-line description survives. Column names from Jira, GitHub,
  Linear, Asana, Trello, ClickUp, Notion databases and spreadsheets are
  recognised (`Title`/`Name`/`Summary`, `Status`/`State`/`List`,
  `Priority`, `Labels`/`Tags`, `Due date`, `Assignee`, `Description`). See
  `HEADER_ALIASES` for the full list.
- **JSON**: a list of tasks, `{ "tasks": [...] }`, or a Trello board export.

## Before anything is written

The preview shows where each task lands:

- **Column.** Matched by key, label or a common synonym ("To Do", "In Review").
- **Priority.** Matched the same way.
- **Assignee.** Matched against project members.

A value that matches nothing is named once, together with where those tasks go
instead: the Backlog, Medium priority, or unassigned.

**Duplicates.** A task whose title is already on the board, or repeats an
earlier row of the same file, is marked "Already there". These tasks are left
out unless you untick **Leave them out**. Titles are compared without case or
extra spaces, so importing the same export twice doesn't double the board.

## Taking it back

After an import the dialog offers **Undo import**. It deletes every imported
task that nobody has changed since. A task someone already edited, moved or
commented on stays, and the message says how many stayed. Undo is for project
owners and admins, the roles that may delete tasks. Everyone else sees that
every imported task is listed under Activity: the `tasks_imported` entry
keeps their ids, and an undo is logged as `tasks_import_undone`.

## Limits

- Up to 1,000 tasks per import and a 5 MB file. On Guidon Cloud the plan's
  tasks-per-project limit applies to the whole batch.
- Imported: title, description, column, priority, labels, due date and
  assignee. **Not imported:** comments, subtasks, attachments, custom fields,
  links between tasks, and history (created dates, who changed what). Keep
  the original export if you need those.
- Assignees must already be members of the project. Anyone else is left
  unassigned and named in the preview.
- Due dates keep the day; times of day are dropped.
- Statuses and priorities that have no column or priority in the project
  fall back as described above. Add the column first if you want to keep them
  apart.
