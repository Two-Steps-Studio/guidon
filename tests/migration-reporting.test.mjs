import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = new URL('./fixtures/migration-cli-pg.mjs', import.meta.url).href;
const loader = `import { register } from 'node:module'; register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(`
export async function resolve(specifier, context, next) {
  if (specifier === 'pg') return { url: ${JSON.stringify(fixture)}, shortCircuit: true };
  return next(specifier, context);
}`)}), import.meta.url);`;

function report(flag, mode) {
  return spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(loader), 'scripts/migrate.mjs', flag], {
    cwd: root,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: 'postgresql://migration-test-only', GUIDON_MIGRATION_TEST_REGISTRY: mode },
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
}

for (const flag of ['--status', '--dry-run']) {
  for (const mode of ['absent', 'present']) {
    test(`${flag} works without writes on a read-only database (${mode} registry)`, () => {
      const result = report(flag, mode);
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.match(result.stdout, /PENDING/);
      assert.match(result.stdout, /PENDING means unrecorded/);
      assert.match(result.stdout, new RegExp('TEST_REGISTRY_PRESENT=' + (mode === 'present')));
      if (mode === 'present') assert.match(result.stdout, /applied\s+000_baseline_schema.sql/);
      else {
        assert.doesNotMatch(result.stdout, /applied\s+000_baseline_schema.sql/);
        assert.match(result.stdout, /No migration registry found; no registry was created/);
      }
    });
  }
  for (const mode of ['lf', 'crlf']) {
    test(`${flag} accepts historical ${mode} checksums without registry writes`, () => {
      const result = report(flag, mode);
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.match(result.stdout, /applied\s+000_baseline_schema.sql/);
    });
  }
  for (const mode of ['drift', 'sql-drift']) {
    test(`${flag} still refuses changed migration checksums (${mode})`, () => {
      const result = report(flag, mode);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /modified after they were applied/);
    });
  }
}
