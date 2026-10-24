# Module draft editor

Apply migration 083 after 080–082 before deployment. This adds one personal
draft per user/project; no installation or existing module records are changed.
Owners/admins can read and save only their own draft while they retain the
project role. Another admin cannot read its prompts or history. RLS applies
to reads/inserts/updates, identity columns cannot be updated and anonymous
clients have no grants. Project/user deletion cascades to personal drafts.

## Editing and storage

Desktop (1280px viewport and up) shows Chat/Preview/Inspector at 28/52/20
relative widths by default. Accessible range controls adjust Chat to 25–30%
and Preview to 50–55%; Inspector gets the remainder. Smaller screens use
keyboard-accessible tabs with arrows/Home/End. The toolbar stays available
at the top on small screens.

The draft contains the description, validated plan and matching generated
manifest, plus up to 20 undo/redo steps. Fast consecutive typing is grouped
into one edit. Undo/redo and restoring a history item preserve the complete
snapshot; branching clears redo. Oldest undo snapshots are evicted when the
900KB application budget is reached. History is bounded, not a permanent
audit log. Approval/installation consent flags are never saved and always
reset when editing/restoring/reloading. A generated manifest is not an
installed or published module.

Changes autosave after 800ms, serialized behind any pending save. If a response
arrives after more typing, the next save uses the new revision and latest state.
Creation is one unique INSERT; subsequent saves use one UPDATE scoped by
project, current user and revision. A stale tab cannot overwrite a newer draft.
Conflicts stop autosave and preserve local edits; download a JSON backup before
reloading the newer server copy. There is no automatic merge or blind overwrite.
The backup is a JSON recovery artifact; an import/merge UI is not supplied.
Failures show retry/export/reload controls. Wait for Draft saved before SPA
navigation; tab close/reload warns when there are unsaved changes, but browser
delivery is not guaranteed if a process crashes or navigation skips the warning.

The preview renders only the draft's validated structure, with empty module
data and disabled form controls. It reads no project records, writes nothing
and makes no module network requests. The toolbar Test checks current schema
and permission validity; the dedicated fixture/validation task will add richer
data, reports and pre-publication checks. Publish is visibly unavailable until
the registry moderation task is implemented. The existing explicit installation
action remains in Inspector.

## Verification

`npm run test:module-editor` tests history roundtrips, grouping, branching,
limits, mismatched manifest rejection and absence of persisted consent. It
then bundles the actual editor, preview and autosave hook using the Webpack
already bundled with Next.js. Only auth/AI/storage/navigation/i18n boundaries
use fixture adapters. Playwright covers 1440px panels/resize, 375px/768px tabs,
keyboard navigation, overflow, disabled preview controls, approval/generation,
undo/redo, fresh consent, reload, typing during an in-flight save and two-tab
conflict preservation. It does not authenticate to a deployed app.

`test:db` applies migration 083 in isolated PGlite and checks actual RLS,
own versus other-admin drafts, reader/anonymous denial, revoked membership,
immutable identity, shape constraints and stale revisions. Full authenticated
staging E2E remains Marketplace QA. No production migration or deployment is
performed by these tests.
