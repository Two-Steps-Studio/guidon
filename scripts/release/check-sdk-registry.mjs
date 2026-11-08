// Require the checkout's exact SDK version on npm before publishing the CLI.
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
const { name, version } = JSON.parse(readFileSync(new URL('../../packages/sdk-js/package.json', import.meta.url), 'utf8'));
const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
let detail;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const published = await response.json();
      if (published.name === name && published.version === version) {
        console.log(`Verified ${name}@${version} on npm.`);
        process.exit(0);
      }
      detail = 'Registry returned unexpected package metadata';
    } else {
      detail = `HTTP ${response.status}`;
    }
  } catch (error) {
    detail = error.message;
  }
  if (attempt < 11) await setTimeout(5000);
}
throw new Error(`Publish ${name}@${version} before the CLI. Exact version unavailable on npm (${detail}).`);
