// Prevent a broken CLI release: consumers need the published SDK package,
// the version range must track this monorepo's SDK version, and the license
// file must ship with the package.
import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bad = Object.entries(pkg.dependencies ?? {}).filter(([, spec]) => /^(file|link|workspace):/.test(spec));
if (bad.length) {
  console.error(`guidon-cli: refusing to publish with local dependencies: ${bad.map(([n, s]) => `${n}@${s}`).join(", ")}.`);
  process.exit(1);
}

const sdk = JSON.parse(readFileSync(new URL("../../sdk-js/package.json", import.meta.url), "utf8"));
if (pkg.dependencies?.["@guidon/sdk"] !== `^${sdk.version}`) {
  console.error(`guidon-cli: @guidon/sdk must match the local SDK version range ^${sdk.version}.`);
  process.exit(1);
}
if (pkg.license !== "MIT" || !existsSync(new URL("../LICENSE", import.meta.url))) {
  console.error("guidon-cli: the MIT LICENSE file must be present before publishing.");
  process.exit(1);
}
