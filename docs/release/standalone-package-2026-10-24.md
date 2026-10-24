# Standalone artifact hardening — 2026-10-24

Task: `7acbf37e-00cc-4a67-b024-1159da7740bc`.

## Cause and fix

Next 16.4.3 interpreted the local storage provider's `path.resolve(root)` as a
dynamic build filesystem dependency, tracing the whole project. The build's own
diagnostic specifies `turbopackIgnore: true` at that call as the supported opt-out.
Storage contains mutable runtime uploads, never server source/build inputs, so
that annotation now marks this exact boundary. The runtime path containment,
bucket checks and authorization are unchanged. A fresh local build no longer
reports broad tracing and standalone root contains `.next`, `node_modules`,
`package.json`, `server.js`.

Tracing excludes configuration, storage, diagnostics and tooling as additional
protection. Operator-configured in-repository storage directories are excluded;
the repository root is rejected as a storage directory.

Separately, Next's `writeStandaloneDirectory` explicitly copies loaded `.env`/
`.env.production`, outside tracing exclusions. The npm postbuild guard removes
only generated root `.env*` copies. It checks canonical `.next/standalone` paths,
rejects symlink/junction redirection, and refuses packages with unexpected runtime
or tooling directories. It does not delete source configuration or uploads.
Vercel builds without standalone output retain platform-managed bundling and the
tracing exclusions. This does not claim to have deployed or inspected Vercel's
final remote artifact.

## Proof

- Unit checks: generated config removed, source config/server preserved,
  forbidden directory fails, redirected standalone output fails without changing
  the destination, missing output allowed only when requested by platform mode.
- A full clean install/migration/build with generated non-secret canaries proves
  `.env.production`, default/custom storage and output do not ship; their source
  copies are intact. Three-browser smoke exercises the resulting package;
  final local run `06f3a7091cdc` passes Chromium/Firefox/WebKit and cleanup.
- Fresh production build succeeds; postbuild removes the generated `.env` copy
  and the broad storage tracing warning is gone.
- CI also runs the packaging unit guard and full canary build.

## CI source-copy regression

Linux CI failed before the app build: tracked `.claude/skills/*` entries are real
directory symlinks, while Windows checkout exposes them differently. E2E source
copy now skips agent tooling directories, with a filter regression check. Those
files are not application inputs; no application paths or security assertions
are skipped. The remote run must still be checked after pushing.

Use `npm run build`, then inject private environment variables at runtime. Direct
`next build` skips the postbuild guard. No production environment, data or deploy
was modified; remaining release gates in the research report still apply.
