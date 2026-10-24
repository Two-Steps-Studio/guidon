# Runtime dependency remediation — 2026-10-24

Task: `dec8686b-4eee-4b95-a657-eaf026da9b97`.

## Result and limits

`npm audit --omit=dev` changed from 11 affected package nodes (3 critical,
5 high, 3 moderate) to **0 reported vulnerabilities** with this lockfile on
2026-10-24. Counts describe advisories against installed versions; they are
neither confirmed Guidon exploits nor a comprehensive application audit.
The release remains on HOLD for the integration/operations gates in
[the research report](./research-and-execution-2026-10-24.md).

| Package | Reviewed exact version |
| --- | --- |
| Next / third-parties / eslint-config-next | 16.4.3 |
| MCP SDK | 1.32.2 |
| sharp | 0.35.5 |
| Zod | 4.6.7 |
| Monaco | 0.57.0 |
| DOMPurify | 3.4.17 |

Compatible transitive patches were applied with non-forced `npm audit fix
--ignore-scripts`. No forced downgrades or authentication/issuer bypasses.
Keep npm overrides and the committed lockfile. Recheck advisories as they change.

## Monaco: inspect what reaches the browser

Monaco's upstream AMD assets embed a sanitizer independently of npm's dependency
tree: 0.56.0 bundled DOMPurify 3.4.8; even 0.57.0 bundled 3.4.15. Updating the
lockfile or npm override alone did not repair those browser assets.

The existing postinstall/prebuild command now compiles Monaco's ESM source with
Next's bundled Webpack, replaces its vendored sanitizer import with the reviewed
npm DOMPurify, and emits the existing local AMD entry and five local workers.
Only the upstream AMD loader and license are copied; upstream editor bundles
are not shipped. Missing replacement/build failures stop installation/build.
Generated metadata records versions and asset SHA-256 checksums; stale or changed
assets trigger rebuilding instead of trusting an old cache marker.

This intentionally unminified build avoids an additional minifier dependency.
All generated assets total about 48.7 MB raw / 8.49 MB individually gzipped on
the verification machine. This is the entire language/worker set, not an initial
page transfer; the editor and workers load on demand. Measure editor startup and
consider a reviewed minification/language-budget follow-up before claiming a
performance improvement. Public deployment must retain these locally served assets.

## Verification

- Production build succeeds on Next 16.4.3; clean install/build/migrations also
  succeed inside the disposable application runner.
- Auth and module/schema suites pass; database suite: 596 pass / 0 fail.
- Catalog and module editor browser fixtures pass.
- New dependency check asserts installed versions and scans emitted browser JS
  for the patched sanitizer, plus all worker entry files.
- Actual local AMD editor loads, accepts typing, and obtains TypeScript semantic
  diagnostics from the local worker in Chromium.
- Real login/private-project/session/logout smoke passes Chromium, Firefox and
  WebKit in isolated run `baa538890a46`; exact container/temp cleanup completes.
- Targeted ESLint passes. CI now checks runtime advisories and shipped editor.

The standalone runner copies complete public/static assets into the standalone
directory, tolerating directories already partially populated by tracing.

## Additional packaging finding

Next 16.4.3 reports broad filesystem tracing from the local storage provider.
The local standalone output includes unrelated repository folders. Next also
explicitly copies loaded `.env`/`.env.production` files into standalone output
(see installed `next/dist/build/index.js`, `writeStandaloneDirectory`). Do not
mistake the presence of those files for public HTTP exposure or a proven leak.
The Docker context already excludes real environment files; E2E copies no env
files and uses disposable credentials. A dedicated packaging hardening follow-up
must keep runtime data/configuration out of distributable standalone artifacts.

No production deploy or database mutation was performed.

## Primary advisory references

- [Next/sharp upstream image advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
- [MCP SDK redirect handling](https://github.com/advisories/GHSA-6prh-2h8m-c8cw)
- [Zod oversized collection advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [DOMPurify patched release advisory](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f)
