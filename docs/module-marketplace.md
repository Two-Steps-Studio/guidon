# Module catalog and details

Apply migrations 080 and 081 before deployment. `/marketplace` and
`/my-modules` are signed-in pages; the sidebar links to both. The catalog reads
actual `module_catalog_entries` rows under the caller's RLS identity. It does not
invent install counts, reviews, verification badges or third-party publications.
The initial listing is a first-party declarative release-planning example.

Search matches name, author and description. Category and compatibility filters
combine with text search and survive in URL query parameters. A GET form works
without client JavaScript. The initial registry returns up to 200 releases;
pagination must be added before expanding beyond that bound. My Modules lists
up to 200 accessible project installations and links to their project editor.
It fetches only manifests/status, not every project's record document.

Details identify the exact package/version and show its author, description,
engine range, every permission request, release notes, local screenshot assets,
declared entities/fields and fixture-only read-only previews. Unknown scopes
are disclosed by name and make the release incompatible. No preview save
action is supplied. Reporting links to the existing contact channel; the
module identifier/version is shown beside it. The project installation wizard
is linked from compatible release details. Project owners/admins can manage
versions, settings, retained data and exports as documented in `module-lifecycle.md`;
those controls require migration 082.

## Project installation

The wizard lists only projects where the caller is an owner/admin. Select an
organization and project, review the displayed scopes, and explicitly approve
them. The server reloads the catalog entry under the caller's identity and
rechecks the target role. Organization-scoped releases can only be installed
inside their source organization. A SHA-256 digest of the normalized displayed
manifest detects a changed artifact between display and submission; the exact
posted scope list must still match. Unknown dependency declarations are rejected
by the strict v1 manifest, rather than being implicitly installed.

Installation is one project-scoped INSERT containing the manifest and empty
records. Preview data is never copied by the catalog wizard. Retrying the exact
same normalized manifest returns the existing installation without touching
its records/revision. A different version/content conflicts. Duplicate/last-slot
races resolve to an existing matching installation; the database enforces the
20-package cap. Failed inserts leave no partial installation. Success redirects
to the installed module's card in the project's Modules section.

Published global entries can be read by signed-in users. Organization entries
require membership of their own organization. Anonymous users have no table
access. Authenticated clients cannot write registry tables directly; they
publish through the functions described below.

Screenshots are limited at the application boundary to local `/module-media/`
assets without parent-directory paths. This avoids loading arbitrary publisher
tracking images. Text fields are rendered as React text, and manifests plus
demo records pass the runtime schemas before being displayed.

## Verification

`npm run test:db` verifies registry publishing authority, global versus
organization visibility and hidden drafts alongside the module RLS tests.
For browser checks:

```sh
npx playwright install chromium
npm run build
npm run test:module-catalog
```

The Playwright suite mounts the actual server-rendered catalog component and
filter code in an isolated fixture HTTP server. It exercises browsing, text and
combined filters, empty states, URL preservation, detail links and 375px
overflow, and checks permission disclosures and untrusted text escaping.
It also exercises the actual installation fields and orchestration over a
fixture HTTP flow: required consent, project choice, retry and server denial.
`test:modules` checks artifact/scope/org/version/role/race failures, while
`test:db` runs that same installation core against real local RLS and proves
that retries and failed attempts preserve edited records. These are fixture/
domain integration tests, not authenticated deployed-app E2E tests.
Run the dedicated Marketplace QA task against staging before release.
The `Modules and marketplace` pull-request workflow runs these checks against
an isolated database and fixture server using build-only environment values.

To regenerate the first-party screenshot from the actual runtime views:

```sh
npm run test:module-catalog -- --update-screenshots
```

## Publishing, review and the author dashboard

Apply migration 093 after 092. Project owners/admins publish from the AI
builder (**Publish**) or from an installed module's Configuration page
(**Publish to the Marketplace**): version (SemVer, higher than every earlier
version of that id), author name, visibility, category, license (SPDX list
in `MODULE_LICENSES`) and a description.

- **Private**: only the author sees and installs it. **Organization**:
  members of the project's organization. Both are published at once.
- **Public**: waits in **Admin → Module review** (instance admins,
  `ADMIN_EMAILS`). The reviewer sees permissions, views, the full manifest
  and automatic findings - links, HTML/script-like text and text that reads
  like instructions to an AI (module text reaches agents through task
  context), plus write access. Approve publishes; reject requires a note the
  author sees. Nobody reviews their own submission: the app hides the
  buttons, `public.review_module_version` refuses, and a CHECK constraint
  backs both. The submitter gets a notification with the decision.
- The first publisher of a module id owns it (`module_listings`); later
  versions come from the owner or an owner/admin of the listing's
  organization.
- A version is immutable from submission (trigger, service role included):
  a fix is a new version. Published versions cannot be deleted - they are
  **withdrawn** by the author (My modules) or an admin (from a report).
  Withdrawn versions leave the catalog and can't be installed; projects
  that run them keep working and can switch versions.
- **Signatures**: with `MODULE_SIGNING_KEY` set, each published version is
  signed (Ed25519 over the module id, version and the SHA-256 of the manifest
  as the app reads it). A version whose signature no longer verifies - a
  manifest changed in the database - is shown as such and cannot be
  installed. Public key: `/.well-known/guidon-module-signing-keys.json`.
  Without the key nothing is signed and versions install as before.
- **SCA**: manifests are declarative; dependencies and executable code are
  rejected by the schema, so there is nothing to scan beyond the license and
  the review findings.
- **Reports**: any signed-in user who can see a version reports it once
  (reason + details). Admins resolve reports or withdraw the version; the
  author only sees the number of open reports.
- **Audit log**: `module_registry_events` (append-only) records submissions,
  publications, decisions, withdrawals, reports and signatures. Authors read
  their modules' entries; admins see the latest 50 on the review page.
- **Author dashboard** (My modules → Published by you): every version with
  visibility, status and review note, engine range, release channel
  (pre-release when the version has a `-` suffix), installs and open
  reports. Counts come from `public.module_install_counts()` - aggregates
  for the caller's own modules only, never which projects. Installs are
  projects whose `project_module_packages.catalog_version` names that
  version (set by the installer and version changes, checked by a trigger).

`test:db` section 77 covers publishing, visibility, ownership, immutability,
self-review, approval, reports, counts, withdrawal and the audit log on real
PostgreSQL. `tests/module-registry.test.mjs` (in `test:modules`) covers the
review findings and signatures. The release E2E's Marketplace scenario
(`tests/e2e/marketplace.mjs`, Chromium) runs the whole flow through the UI,
including a tampered manifest being refused and organization visibility.
