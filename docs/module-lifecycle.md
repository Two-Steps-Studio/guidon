# Installed module management

Apply migration 082 after 080/081 before deployment. Existing packages become
installed with empty settings; their manifest, enabled state and records are
unchanged. Project owners/admins open Configuration from a module card.
The global My Modules page also identifies retained uninstalled packages.

Configuration currently selects a declared default view. Enable/disable affects
rendering and record writes. Uninstall sets `installed=false, enabled=false` and
retains the manifest, records and settings; it never deletes rows. Retained
packages count toward the existing 20-package cap. Restoring one requires
explicit approval of its current permissions and reuses the retained data.
Re-running the catalog installer for an archived package does not silently
restore its grants: it returns the existing package, whose Configuration page
offers explicit restoration.

Owners/admins can download a JSON attachment containing manifest, records and
settings. The export uses the caller's project access, `private, no-store` and
`nosniff`; neither user secrets nor another project's data are included.
Deleting the entire project intentionally cascades to its module data, so the
manager tells the user to export before deleting a project.

## Version changes

The manager lists accessible catalog releases for the same module identity.
The initial version chooser is bounded to 50 accessible releases; pagination
is required before publishing more versions for one module.
It shows release notes and added/removed permission scopes before submission.
Updates and rollbacks both require exact permission consent and a digest of
the reviewed catalog artifact. The server rechecks project role, source-org
scope, runtime support and current revision before saving.

The new manifest must validate every current record. New optional fields can
work without transforming data. Required-field additions without values,
removed fields with stored data, removed select options and narrower invalid
types/bounds reject the change. No migration script, record deletion or
automatic filling runs. Rollback changes the compatible manifest and retains
today's records; it does not restore an old data snapshot. If the new manifest
removes the configured default view, that preference returns to automatic,
as disclosed on the review screen.

All mutations use one revision-guarded UPDATE and leave `records` untouched.
Stale sessions conflict. The database independently prevents archived packages
from being enabled and retains the owner/admin RLS boundary and immutable IDs.

## Verification

`test:modules` exercises the same lifecycle decision function used by the
server action: compatible/unsafe version changes, exact permission consent,
reviewed digests, source organization, restore, stale revisions, runtime
compatibility and declared-view settings. `test:db` checks disable/archive/restore,
record preservation, stale revisions, settings constraints, compatible
update/rollback, DELETE denial and read-only role restrictions in isolated
PostgreSQL. Existing export/management authorization relies on the shared
server-side project gate plus RLS. Authenticated staging/browser E2E remains
part of the dedicated Marketplace QA task.
