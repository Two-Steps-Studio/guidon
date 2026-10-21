// Refuses `npm publish` while the SDK dependency still points at the local
// checkout (file:../sdk-js) - a published package with a file: dependency
// can't be installed by anyone. Publish @guidon/sdk first, then set the
// dependency to its version range (e.g. "^0.1.0").
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bad = Object.entries(pkg.dependencies ?? {}).filter(([, spec]) => /^(file|link|workspace):/.test(spec));
if (bad.length) {
  console.error(
    `guidon-cli: refusing to publish with local dependencies: ${bad.map(([n, s]) => `${n}@${s}`).join(", ")}.\n` +
      `Publish the SDK first and change the dependency to a version range (e.g. "@guidon/sdk": "^0.1.0").`
  );
  process.exit(1);
}
