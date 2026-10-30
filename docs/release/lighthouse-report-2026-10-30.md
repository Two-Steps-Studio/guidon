# Follow-up to the supplied Ora PDF and Lighthouse report

The supplied Lighthouse 13.5 desktop run measured a signed-in project board on 2026-10-30: performance 88, accessibility 100, best practices 100, SEO 58 and agentic browsing 98. The PDF is a separate external snapshot with overall agent readiness 89. Neither score is a promise of a later scan's result.

## Implemented changes

- Standard robots directives only; experimental discovery hints are comments. ARD remains discoverable at its well-known URL and through HTTP links. Private project/dashboard/profile/admin/API crawl restrictions remain.
- The skill advertises and serves `text/markdown; profile="urn:air:agent-skills"` consistently. The OpenAPI entry retains its actual media type. ARD explicitly accepts syntactically valid media types beyond its recognized examples; removing a valid API description or declaring it to be a different format would misrepresent the resource. [ARD specification](https://github.com/ards-project/ard-spec/blob/main/spec/ard.md), [Google robots syntax](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).
- One likely visible card cover loads eagerly at high priority; other covers stay lazy. Session-authorized previews produce small WebP covers, including for older attachments with no thumbnail. Requests check task/project/attachment RLS before reading storage or the bounded internal derivative cache. Browser responses are private/no-store, originals are not overwritten, and no production backfill or migration is required.
- Avatars from the configured Supabase **public avatar bucket** use Next image resizing. Signed/private URLs, unknown hosts and local signed storage URLs retain their existing behavior. Next's restrictions on local query strings, private addresses and remote origins are preserved.
- Python SDK HTTP errors are closed before retrying or raising; a regression covers terminal and retried errors.
- A manual MCP Registry workflow validates the existing manifest with publisher 1.8.7 and a pinned SHA-256. Only an explicit `publish=true` dispatch from this repository's main branch can publish, using GitHub OIDC in the `mcp-registry` environment. PR validation has no publishing permission.

## Findings that need different treatment

The report's unused-JavaScript list includes several `chrome-extension://` resources. They are not shipped by Guidon. Repeat performance measurements with an extension-free profile; do not count extension bytes as removed application bytes.

The authenticated board intentionally remains non-indexable. Measure public search pages separately. Do not make project content public or remove private cache protections to increase a Lighthouse score. The bfcache findings were marked not actionable by Lighthouse.

Missing extension source maps are outside the application. Large inline page data has no separate source map to publish. Existing private Sentry source-map processing is retained.

The PDF's verified-brand linking recommendation is already present in homepage JSON-LD, pointing to the actual GitHub repository/organization. No invented Wikipedia/Wikidata/social profiles, ratings or legal identities are added. Search ranking and registry indexing require external observation after rollout.

## Publication status and owner actions

At the public registry check, npm `@guidon/sdk`, npm `guidon-cli` and PyPI `guidon-sdk` returned 404; the official MCP Registry search returned no Guidon entry. These checks do not prove name ownership or reserve a name. The owner confirmed npm organization access; local npm authentication is pending. Existing package workflows and [package publishing instructions](../package-publishing.md) cover SDK/CLI releases. Publish the JavaScript SDK before its dependent CLI.

For MCP: after merging and reviewing validation, configure the GitHub `mcp-registry` environment for main with an appropriate reviewer, then run **Publish MCP Registry entry (manual)** with `publish=true`. The namespace is `io.github.two-steps-studio/guidon`. No PAT, registry secret, OAuth bypass or production application deployment is needed. Verify the resulting entry's repository, version, website and HTTPS remote. [Official publisher commands](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/cli/commands.md).

Do not activate real payments for scoring. The app's legal/operator and payment release gates remain independent prerequisites.

## Verification

The isolated production build and targeted regression suite passed Chromium, Firefox and WebKit (`bb8deba6cb4e`): real legacy-image resizing, unchanged originals, anonymous/foreign/traversal rejection, authorization before warm-cache access, attachment-deletion revocation, private optimizer rejection, local avatar fallback, image priority, robots parsing and skill response headers. The run also passed existing REST/MCP isolation and attachment regressions.

The owned-public-avatar URL builder test, TypeScript, focused ESLint and agent-web tests passed. SDK JavaScript/CLI and Python tests passed; the Python suite includes HTTP error-response cleanup. The official publisher accepted `server.json` in validation-only mode. Full CI and a hosted Supabase verification remain rollout checks; no new Lighthouse 100 or Ora 100 is claimed.

Full local production E2E subsequently passed all three browsers (`dcd396029440`). npm tarballs passed the publication metadata/license guard and were installed outside the workspace; SDK import and CLI version/help passed. The Python wheel and sdist passed strict Twine/metadata/license checks and were separately installed and imported in an isolated environment. None of these checks publishes a package or spends production billing funds.
