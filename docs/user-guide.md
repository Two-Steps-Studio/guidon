# Guidon user guide

Guidon keeps project work together with the decisions, references, and context
that explain it. This guide covers the main workflows available in the web
application. Features shown in a project depend on its configuration, your
role, and the services enabled by its administrator.

## Start here

1. Create an account and sign in.
2. Create or join an organization. An organization groups its members,
   projects, and (on Guidon Cloud) billing.
3. Create a project. Choose a project template if one fits; templates set an
   initial selection of modules and labels. You can adjust project settings
   later.
4. Invite teammates from the organization's member settings, then add them
   to projects with the roles they need. **Add Member** adds someone who
   already has an account right away. For an address without an account it
   sends an invitation link instead (also shown to you, to share yourself).
   The link works once, only for that email address, and expires after 7
   days. Pending invitations are listed on the members page, where you can
   cancel them; adding the person again sends a new link.

The dashboard summarizes your open and overdue tasks, recent activity, and
projects. Use **My tasks** to see work assigned to you across projects.

## Projects

A project overview shows its description, progress, recent activity, and
quick links to enabled modules. The project sidebar is the main way to move
between project areas. Project settings let authorized members manage the
project and choose which modules appear in navigation. Hiding a module is a
display preference; it does not delete its data.

The available project areas include:

- **Work** — task board, task details, comments, attachments, labels,
  subtasks, and task relationships.
- **Calendar** — tasks and project dates in a calendar view.
- **Roadmap** — project milestones and planned work.
- **Files** — project documents and connected repository files.
- **Knowledge** — collected project knowledge and sources.
- **Decisions** — decisions and their rationale.
- **References** — links and other useful project references.
- **Technology** — the project's technology inventory.
- **Memory** — review project insights generated from its activity and
  context when AI is enabled.
- **Context** — relationships between project entities and the background
  behind the work.

Not every project needs every area. Project templates provide starting
configurations; project administrators can change enabled modules later.

## Tasks and the work board

The board groups tasks by workflow status. Guidon's built-in statuses are
Backlog, Todo, In Progress, AI Working, Review, and Done. Project workflow
settings may adjust how columns are presented.

Open a task to edit its details, assignee, priority, due date, labels, and
description. The task view also brings together comments, file attachments,
subtasks, relationships, and the task's project context. Use board filters
and **My tasks** to focus on work assigned to you. Bulk actions are available
for selecting multiple tasks on the board.

To move work in from Jira, Linear, Trello, Asana, ClickUp, Notion or a
spreadsheet, use **Import** on the board. See [Moving tasks into
Guidon](importing.md) for what is kept, duplicates, undo and limits.

When an AI agent works on a task, it can move through the workflow and leave
its result for a person to review. Project AI permissions determine which
agent actions are allowed.

## Project context and AI

Decisions, knowledge, references, technology, and context relations help
teammates understand why a task exists and what it depends on. The Memory
area can surface candidate insights for human review. AI features require AI
to be enabled for the project and a configured provider; availability also
depends on project permissions.

For programmatic agent access, use Guidon's REST API and MCP server. Start at
the [developer portal](https://useguidon.com/developers), review the
[OpenAPI specification](https://useguidon.com/openapi.json), and follow the
authentication and project-permission requirements there. Keep API keys
private and grant only the access needed by each integration.

## Integrations

The **Plugins** page lists the available Guidon integrations and their
installation instructions. Integrations include supported game engines,
creative tools, code editors, and the desktop app. A connected integration
may require its own sign-in or API key; follow the instructions shown for
that integration.

## Organizations, access, and billing

Organization membership and project membership are managed separately.
Project roles are Owner, Admin, Developer, Tester, and Viewer; what each
person can change depends on the action and the project's permission rules.
Ask an organization or project administrator to update access if a control
is unavailable.

Guidon Cloud organizations can manage their subscription from organization
billing settings. Self-hosted installations do not use Guidon Cloud billing;
see the [self-hosting guide](./self-hosting.md) for deployment and
configuration details.

## More documentation

- [Architecture](./architecture.md) — application structure and data flow.
- [Configuration](./configuration.md) — environment variables and providers.
- [Authentication setup](./auth-setup.md) — OAuth provider setup.
- [Self-hosting](./self-hosting.md) — deployment and operational setup.
- [Backups](./backups.md) — backup and recovery guidance.
- [Upgrading](./upgrading.md) — updating a self-hosted installation.
- [Webhooks](./webhooks.md) — outgoing webhook configuration.

For API and MCP details, use the [Guidon developer portal](https://useguidon.com/developers).
