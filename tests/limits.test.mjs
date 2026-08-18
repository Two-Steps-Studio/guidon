#!/usr/bin/env node
/**
 * Proves the Guidon Cloud project-limit check (src/lib/limits.ts) actually
 * flips off for self-hosted installs — the whole point of that module.
 *
 *   npm run test:limits
 *
 * Mirrors the real module (same reasoning as tests/auth/local-auth.test.mjs
 * — plain `node *.mjs` here has no loader for the `@/` path alias or the
 * "server-only" import that file carries).
 */

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n  ${title}`);
}

// Mirrors src/lib/limits.ts + src/lib/db/pool.ts's hasDirectDatabase().
const HOSTED_PROJECT_LIMIT_PER_ORG = 1;

function hasDirectDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function isHostedProjectLimitReached(currentProjectCount) {
  if (hasDirectDatabase()) return false;
  return currentProjectCount >= HOSTED_PROJECT_LIMIT_PER_ORG;
}

function testHostedMode() {
  section("tryb hostowany (brak DATABASE_URL) — limit 1 projektu/organizacje");

  delete process.env.DATABASE_URL;

  check("0 projektow: limit nieosiagniety", !isHostedProjectLimitReached(0));
  check("1 projekt: limit osiagniety", isHostedProjectLimitReached(1));
  check("2 projekty: limit dalej osiagniety", isHostedProjectLimitReached(2));
}

function testSelfHostedMode() {
  section("tryb self-hosted (DATABASE_URL ustawione) — brak limitu");

  process.env.DATABASE_URL = "postgresql://guidon:test@localhost:5432/guidon";

  check("0 projektow: bez limitu", !isHostedProjectLimitReached(0));
  check("1 projekt: bez limitu", !isHostedProjectLimitReached(1));
  check("100 projektow: nadal bez limitu", !isHostedProjectLimitReached(100));

  delete process.env.DATABASE_URL;
}

function main() {
  testHostedMode();
  testSelfHostedMode();

  console.log(`\n  ${pass} pass / ${fail} fail\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
