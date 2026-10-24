# RFC 0001: Guidon Module Manifest v1

- **Status:** Proposed; schema and validator are implemented, but no installer
  or runtime consumes this manifest yet.
- **Scope:** Declarative, installable modules for a future project-level module
  system.
- **Schema:** [`module-manifest-v1.schema.json`](../schemas/module-manifest-v1.schema.json)
- **Validated example:** [`release-planning.json`](../../examples/module-manifests/release-planning.json)

## Context

The current Custom Modules feature stores user-authored project content in
`projects.custom_modules`. Its `version: 1`, `title`, and `blocks` describe that
content format. It is not a package version, module manifest, permission grant,
or executable plugin. The current editor, import/export flow, database column,
and validation in `src/lib/work/custom-modules.ts` continue to use that format.

An installable module needs stable package identity and versioning, explicit
engine compatibility, a permission request, declarative entities and views,
safe schema updates, and a bounded lifecycle. It must not introduce arbitrary
code into the Next.js server or gain ambient access to project data.

## Manifest contract

Each manifest has `manifestVersion: 1`, a kebab-case package `id`, display
`name`, strict SemVer `version`, publisher `author`, and an `engine` range with
an inclusive `minVersion` and optional exclusive `maxVersionExclusive`.
Build metadata does not affect version ordering. If both engine bounds are
present, the upper bound must be greater than the lower bound.

`permissions` is an optional list of allowlisted capability requests. Omission
means an empty list. Supported request identifiers are `project:read`,
`tasks:read`, `tasks:write`, `decisions:read`, `knowledge:read`,
`module-data:read`, and `module-data:write`. Unknown or duplicate requests are
invalid. A request is not a grant: a future installer must show each requested
capability, require an authorized project admin to approve it, store grants
separately from the package, and enforce each grant on every server operation.
Until that runtime exists, these strings provide schema vocabulary only.

Entities and fields are declarative. Field types are limited to `text`,
`number`, `boolean`, `date`, and `select`. Views are limited to `table`, `board`,
and `form`, and must reference a declared entity and its fields. Entity, field,
view, option, and permission identifiers must be unique in their scope.

`dataVersion` starts at 1. Each migration increments it by exactly one and
contains only `add_entity` or `add_field` operations. The complete migration
chain from version 1 to `dataVersion` must be present and ordered. Destructive
operations, SQL, scripts, network callbacks, and arbitrary lifecycle hooks are
not supported. The lifecycle object currently permits only declarative
installation, immediate enable/disable, and data retention on uninstall. Data
purging is not automatic.

The JSON Schema covers structural constraints. `moduleManifestSchema` also
checks SemVer range ordering, unique IDs, entity/view references, migration
chains, and numeric bounds. Consumers must use the Guidon validator or
implement those documented semantic constraints; the extension field in the
schema names them.

## Compatibility and migration plan

This proposal is additive. It does not change migration `079_custom_modules.sql`
or the current `custom_modules` JSON shape, and the current editor must reject
an installable manifest instead of treating it as user content. Existing
projects require no database backfill and keep their saved modules unchanged.

Before enabling installs, a separate implementation phase must:

1. Add a distinct storage model for installed module identity, pinned package
   version, approved permission grants, data version, and project ownership.
2. Add organization/project RLS and server-side capability enforcement before
   exposing any module data or action API.
3. Apply additive migrations in a transaction, verify engine compatibility,
   and preserve a recoverable snapshot before upgrades. Reject an upgrade when
   any migration step is unsupported or fails; do not partially apply it.
4. Retain module data on uninstall by default. Export or purge only through a
   separate explicit admin action with a confirmation and audit record.
5. Keep legacy content modules in `projects.custom_modules`. If conversion is
   ever needed, implement a reviewed adapter that preserves the original JSON
   and reports unsupported blocks; do not infer a SemVer package version from
   the old integer `version: 1`.

There is intentionally no database migration or installer in this RFC. A
future runtime must pass permission, tenant-isolation, migration rollback,
package integrity, and untrusted-content review before it can load modules.

## Security defaults

- No executable package code, dynamic evaluation, arbitrary HTML, SQL,
  filesystem, network, or secret access.
- Missing permissions resolve to `[]`; there are no implicit grants.
- Unknown properties and permission names fail validation.
- Views and migrations cannot reference undeclared entities or fields.
- Uninstall retains data, and declarative migrations are additive only.
- Schema validation alone never authorizes access. Server-side policy and RLS
  remain mandatory.
