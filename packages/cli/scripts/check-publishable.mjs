// Ensure the packed CLI can resolve the SDK from npm.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const sdk = JSON.parse(readFileSync(new URL("../../sdk-js/package.json", import.meta.url), "utf8"));
const bad = Object.entries(pkg.dependencies ?? {}).filter(([, spec]) => /^(file|link|workspace):/.test(spec));
if (bad.length) {
  console.error(`${pkg.name}: local dependencies cannot be published: ${bad.map(([name, spec]) => `${name}@${spec}`).join(", ")}.`);
  process.exit(1);
}
if (![sdk.version, `^${sdk.version}`, `~${sdk.version}`].includes(pkg.dependencies?.[sdk.name])) {
  console.error(`${pkg.name}: depend on ${sdk.name} at ${sdk.version}, ^${sdk.version}, or ~${sdk.version}.`);
  process.exit(1);
}
