# Guidon task pass — 22 October 2026

Board read: **Gudion**, project `6661ef0a-81d9-490e-bdf7-f954ed4accd4`.
The starting board contained 141 tasks: 8 todo, 87 review and 46 done.
All todo descriptions and prior attempts were read. Existing review tasks were
inventoried with their history; their review status is not a claim that they
were newly completed or independently accepted during this pass.

| Task | Result in this change | Remaining work |
| --- | --- | --- |
| Wiadomości e-mail | Automated-message headers and delivery diagnostics; plain HTML/text already existed | Verify received SPF/DKIM/DMARC alignment, SMTP/Resend setup and mailbox delivery; code cannot force Gmail Primary |
| Płatności | Existing week/month/year support checked; 28 billing assertions pass | Configure and verify active production prices |
| Ora.ai TODO Ma być 100 | Publishable CLI dependency, root workspaces/lockfile, Python distribution name `guidon-sdk`; corrected an outdated Organization JSON-LD assertion | Publish packages with publisher accounts, external listings/brand sources, deploy and rescan; no claim of 100/100 |
| Seciurity audit | Cloudflare security-audit skill, independently reviewed scoped source audit | See separate audit artifacts and their runtime/coverage limits; this is not security certification |
| Moduły | Declarative custom modules, preset catalog, import/export, AI prompt and revision-controlled save | Apply migration 079; public user-publishing marketplace and executable code remain a separate scope |
| Onboarding | Existing public wizard and account-last setup checked in source | Browser acceptance in a configured deployment |
| Edycja kodu w plikach | Existing mobile file drawer and Monaco model/loading fixes checked in source | Browser acceptance; task has no newer reproduction details |
| Ikony | Project images in switcher/overview; canonical upload suffixes; organization list invalidation | Visual acceptance with real storage URLs |
| Pliki (review) | Earlier successful attempt was absent from main; restored attachment conversion and actual metadata | Existing attachments unchanged; new image uploads may be resized/lossy; small/unsupported/unprofitable conversions retain the original |

## Validation

- TypeScript check and ESLint on changed source pass.
- Schema migration, self-hosted JSONB round-trip, role isolation and concurrent-update checks: 532 database assertions pass.
- Custom module schema: preset round-trip, invalid URL, version, duplicate ID,
  unsupported block and size-limit assertions pass.
- Attachment checks: gzip round-trip, WebP dimensions/transparency and fallback pass.
- Agent web: 171 assertions pass; billing: 28; API core: 45.
- Existing auth, AI, limits, reports, GitHub, labels, import and recurrence
  scripts pass. These are local regression results, not production validation.
- Initial HTTP tests and the build were blocked by sandbox socket/process
  `EPERM`; some Node subprocesses misleadingly returned status zero with empty
  output. They were rerun with additional network permission: JS SDK 31/31,
  CLI 27/27, Python 28/28, webhooks 74 assertions, and all nine client-assertion
  tests pass. Earlier empty subprocess results were discarded.
- Package lock consistency checked with `npm ci --dry-run --offline`;
  SDK/CLI compile and CLI publishability check pass. No packages published.

The production build (`npm run build -- --webpack`) passes. The cached public
Ora score read during this pass is still 89/100. `npm whoami` returns ENEEDAUTH;
no registry login, package publication, deployment or external listing occurred.
A deployment must apply migration 079 and complete the manual checks above
before rollout.
