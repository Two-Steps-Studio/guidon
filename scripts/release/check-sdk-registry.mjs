// Require the checkout's exact SDK version on npm before publishing the CLI.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const sdk = JSON.parse(readFileSync('packages/sdk-js/package.json', 'utf8'));
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const published = JSON.parse(execFileSync('npm', ['view', `@guidon/sdk@${sdk.version}`, 'version', '--json', '--registry=https://registry.npmjs.org'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    if (published === sdk.version) process.exit(0);
  } catch { /* Allow registry propagation after the SDK job. */ }
  await setTimeout(5000);
}
throw new Error(`Publish @guidon/sdk@${sdk.version} before the CLI. Exact version unavailable on npm.`);
