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
and lifecycle controls are separate follow-up tasks.

Published global entries can be read by signed-in users. Organization entries
require membership of their own organization. Drafts remain hidden. Anonymous
users have no table access. Authenticated clients cannot insert, edit, delete
or publish registry releases; only the service role can currently curate them.
The author submission/moderation workflow remains a separate V2 task.

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
It is a component browser test, not an authenticated deployed-app E2E test.
Run the dedicated Marketplace QA task against staging before release.
The `Modules and marketplace` pull-request workflow runs these checks against
an isolated database and fixture server using build-only environment values.

To regenerate the first-party screenshot from the actual runtime views:

```sh
npm run test:module-catalog -- --update-screenshots
```
