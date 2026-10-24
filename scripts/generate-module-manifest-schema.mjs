import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_MANIFEST_JSON_SCHEMA } from "../src/lib/work/module-manifest.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "docs/schemas/module-manifest-v1.schema.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(MODULE_MANIFEST_JSON_SCHEMA, null, 2)}\n`);
console.log(`Generated ${output}`);
