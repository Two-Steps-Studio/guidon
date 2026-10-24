// Next explicitly copies loaded .env files even when tracing excludes them.
// Remove only generated root configuration copies; never touch source config.
import { lstat, realpath, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const forbiddenStandaloneDirectories = [
  "storage", "output", ".git", ".worktrees", "tests", "docs", "desktop",
  "mobile", "discord-bot", "plugins", "agent-plugin", "graphify-out", "skills",
  ".agents", ".claude",
];

export async function sanitizeStandalone(root, { allowMissing = false } = {}) {
  const source = await realpath(root);
  const build = path.join(source, ".next");
  const target = path.join(build, "standalone");
  for (const directory of [build, target]) {
    let info;
    try { info = await lstat(directory); }
    catch (error) {
      if (error.code === "ENOENT" && allowMissing) return { mode: "platform-managed", removed: 0 };
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory) {
      throw new Error("Refusing to modify a redirected standalone output");
    }
  }
  const names = await readdir(target);
  for (const name of forbiddenStandaloneDirectories) {
    if (names.includes(name)) throw new Error(`Standalone output contains forbidden runtime/tooling directory: ${name}`);
  }
  let removed = 0;
  for (const name of names.filter(name => /^\.env(?:\.|$)/.test(name))) {
    const file = path.join(target, name);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Refusing to remove redirected standalone configuration");
    await unlink(file);
    removed++;
  }
  return { mode: "standalone", removed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await sanitizeStandalone(fileURLToPath(new URL("../", import.meta.url)), { allowMissing: Boolean(process.env.VERCEL) });
    console.log(`Server package verified (${result.mode}); removed ${result.removed} generated environment file(s). Inject configuration at runtime.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
