# Module automations

Apply migration 094 after 093. Engine 1.2.

A module's manifest can declare up to 20 `automations`. Each one has a
trigger - `record.created`, `record.updated` or `record.deleted` on one entity,
optionally only when a field `equals` a value - and one to five actions from
a closed list:

| Action | Needs permission | Does |
|---|---|---|
| `create_task` (`title`, optional `priority`) | `tasks:write` | Creates a task in **To Do** of the module's project, attributed to the person whose save triggered it. |
| `notify` (`title`) | `notifications:send` | Notifies the project's owners and admins, linking to the module. |
| `webhook` | `webhooks:send` | Sends the organization's webhooks subscribed to `module.automation` ([webhooks](webhooks.md)). |

`{{field}}` in a title is the record's value as plain text (200 characters at
most). The schema rejects automations whose entity, condition field or action
permission is missing, so the permissions shown when installing a module are
exactly what its automations can do - and installation needs approval of all
of them, in the app (checkbox) or the API (`permissions`).

```json
"permissions": ["module-data:read", "module-data:write", "tasks:write"],
"automations": [{
  "id": "triage", "name": "Triage high bugs",
  "trigger": { "event": "record.created", "entity": "bug", "when": { "field": "severity", "equals": "high" } },
  "actions": [{ "type": "create_task", "title": "Fix: {{title}}", "priority": "high" }]
}]
```

## How runs work

- Saving a module's entries compares them with the saved ones; every
  created/changed/removed entry that matches a trigger is one run (at most 50
  per save). The dedupe key - module, automation, entry, event and the
  package revision the save produced - makes the same change one run, however
  often it is processed.
- The first attempt runs right after the save's response; the rest come from
  `/api/cron/webhooks` (the same cron as webhook retries) after 1 min, 5 min,
  30 min and 2 h. The fifth failure is final. Errors that no retry can fix
  (module disabled or uninstalled, automation removed in a new version, the
  person who triggered it no longer an owner/admin) fail at once.
- Each finished action is recorded before the next one starts, so a retry
  resumes where it stopped. A created task's id is derived from the run, so
  a retry can't create it twice.
- **No loops**: actions never write module entries, so no automation can
  trigger itself or another one.
- Plan limits apply: on Guidon Cloud a task the plan has no room for fails
  the run with the plan's message.

The module's **Configuration** page lists its automations and the last 20
runs (status, attempts, last error) with **Retry** for failed ones. The log
is readable by project owners/admins only; only the server writes it.

## API and MCP

| REST (`/api/v1/projects/<project>/modules…`) | MCP tool | Scope | Who |
|---|---|---|---|
| `GET /modules` | `list_modules` | `project:read` | project members |
| `POST /modules` `{module_id, version, permissions, digest?}` | `install_module` | `project:write` | owners/admins |
| `GET /modules/<id>` | - | `project:read` | project members |
| `PATCH /modules/<id>` `{action: enable/disable/uninstall/settings, default_view?, category?}` | `configure_module` | `project:write` | owners/admins |
| `GET /modules/<id>/runs` | `list_module_runs` | `project:read` | owners/admins (others get `[]`) |

Installing through the API installs a published, installable Marketplace
version only; `permissions` must equal the version's list - an agent should
show it to the person and install only with their consent. Answers never
include module records. Version changes and restoring an uninstalled module
stay in the app, where the permission changes are reviewed.

## Verification

`tests/module-automation.test.mjs` (in `test:modules`): validation, events,
matching, dedupe keys, templates, retry schedule. `test:db` section 78: RLS of
the log, server-only writes, dedupe, webhook and notification types. The
release E2E (`tests/e2e/module-automations.mjs`, Chromium) adds entries in
the UI and checks the one task and notification, the log, a retry, REST
permissions (viewer refused, partial approval refused), install through the
API and `list_modules` through MCP.
