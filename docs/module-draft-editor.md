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

The preview renders the validated draft using deterministic synthetic records
and disabled form controls. It reads no project records, writes nothing
and makes no module network requests. The toolbar Test shows a report for schema,
field references, runtime compatibility, read/write scopes and unsupported
capabilities. External dependencies and executable code are rejected. This local
report does not approve publishing. Publish is visibly unavailable until
the registry moderation task is implemented. The existing explicit installation
action remains in Inspector.

The visual inspector edits entity/field labels, types, select options, required
flags and field order, and adds/removes/reorders table, form, board, chart and
calendar views. Apply validates the entire plan before adding it to draft
history; invalid edits leave the saved plan intact. A referenced field must be
removed from its views before deletion. Applying changes invalidates the
generated manifest and all consent. Draft changes autosave only after Apply.
Changing the prompt keeps the previous plan, and AI refinement receives that
validated plan as bounded untrusted context. It cannot grant permissions or
install the result. Wait for Draft saved before leaving the editor.

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
