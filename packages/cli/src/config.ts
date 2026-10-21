import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
}

/** ~/.config/guidon/config.json (or $XDG_CONFIG_HOME/guidon/config.json). */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(env.HOME?.trim() || homedir(), ".config");
  return join(base, "guidon", "config.json");
}

export async function readConfig(path: string): Promise<StoredConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const { apiKey, baseUrl } = parsed as Record<string, unknown>;
    return {
      apiKey: typeof apiKey === "string" && apiKey ? apiKey : undefined,
      baseUrl: typeof baseUrl === "string" && baseUrl ? baseUrl : undefined,
    };
  } catch {
    throw new Error(`${path} is not valid JSON - fix it or run \`guidon logout\` and log in again.`);
  }
}

/**
 * Writes the config readable by the owner only (0600, directory 0700): it
 * holds an API key that acts as the user. Written to a temp file first and
 * renamed, so a crash never leaves a half-written key file.
 */
export async function writeConfig(path: string, config: StoredConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600); // writeFile's mode is filtered by the umask
  await rename(tmp, path);
}

export async function deleteConfig(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
