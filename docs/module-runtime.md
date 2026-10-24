# Declarative module runtime

Apply migrations `080_module_packages.sql` and `082_module_lifecycle.sql` before deploying this runtime.
Existing content modules and migration 079 stay in place. No backfill is needed.
The project's **Custom modules → Data modules** section accepts Manifest v1;
the legacy content editor continues to accept only its original format.

## Working example

1. As a project owner/admin, open Custom modules and choose the release example.
2. Inspect the manifest and its module-data read/write permissions; approve them.
3. Install. Two explicitly disclosed fixture records are saved to this project.
4. Switch between Releases (table), New release (form), Release board, Release
   status (count chart) and Release calendar (date-grouped agenda).
5. Add/edit/remove a record, reload, and verify the saved result in each view.
6. Open two sessions and save from both. The stale save must show a conflict.
7. A developer can read the saved views but cannot install or edit. A user
   outside the project cannot read its packages, including through the Data API.

The sample manifest and fixture records are in `examples/module-manifests/`.
The runtime engine contract is `1.0.0`; package versions have independent SemVer.

## Component allowlist

| View | Definition | Behavior |
| --- | --- | --- |
| `table` | declared `entity` and `fields` | Text cells, accessible column headings, horizontal overflow |
| `form` | declared `entity` | Typed native controls, required fields and server validation |
| `board` | `groupBy` select field; first visible select if omitted | Fixed columns from declared options, record cards |
| `chart` | explicit select `groupBy` field | Record counts per declared option, numeric text equivalent |
| `calendar` | explicit date `dateField` | Sorted date-grouped agenda plus unscheduled records |

Field types are text, finite number with optional bounds, boolean, real ISO
calendar date, and a selection from declared options. Titles, option labels
and values are React text children. No HTML/Markdown parser, user-specified
element names, arbitrary CSS/JS, iframe, network connector or executable hook
is available. Board/chart group fields and calendar date fields must be present
in the view and have the correct type. Form entry includes the full declared
entity so required fields cannot become unreachable by hiding them in a view.

## Data and access model

`project_module_packages` stores a manifest and its bounded record array as a
single revisioned document. Its `(project_id, module_id)` primary key scopes a
package to one project and indexes the project foreign key. Organization access
is inherited through the existing project-access helper/RLS policies.

All project readers may select package data. Owners/admins may insert and
update; package identity columns cannot be updated by authenticated users.
Neither anonymous access nor authenticated DELETE is granted. Deleting a
project intentionally cascades to its packages, like other project resources.
Installation is atomic and unique; a project row lock serializes the 20-package
cap. Records are bounded to 1,000 total and 1 MB serialized application input.
The database independently bounds JSON shape/count/storage size.

Server actions re-check membership and role, validate the stored manifest, and
validate every input value against declared entities/fields. They reject
unknown fields, invalid dates, duplicate record IDs, non-finite numbers and
excessive data. Saving requires both module-data read/write, an enabled module,
and an unchanged revision. Client state never supplies the authoritative
manifest for a save. The update predicate includes project, module, enabled
state and revision, so a stale session cannot overwrite a concurrent change.

Permission requests are not implicit grants. Installation requires an exact
consent list and engine compatibility. This release implements only
`module-data:read` and `module-data:write`; requests for task/project/knowledge
adapters are rejected. Modules receive no database credentials or host API.
Read/write permissions describe module capabilities; user roles and RLS remain
the independent boundary for the human's access to project data.

## Security evidence and limitations

`test:modules` exercises value validation, five view paths and SSR XSS payloads.
`test:db` uses an isolated PGlite database with every migration and tests
owner/admin writes, developer reads, foreign-tenant/anonymous denials, revoked
membership, identity changes, optimistic conflicts, JSON bounds and install caps.
These tests exercise local PostgreSQL semantics, not the deployed Supabase
configuration. No production migration or deployment is performed here.

The first storage format saves an entire bounded module document. It is suitable
for small project tools; larger datasets require paginated per-record storage
and a tested migration. Updates, enable/disable and uninstall retention/export
are documented in `module-lifecycle.md`. Author publication, AI generation and
sandbox code are separate roadmap tasks.
