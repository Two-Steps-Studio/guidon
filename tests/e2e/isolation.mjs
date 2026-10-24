import path from "node:path";
import os from "node:os";

export function isolatedEnvironment(input, overrides) {
  const result = {};
  for (const key of ["PATH","Path","SystemRoot","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","HOME","USERPROFILE","APPDATA","LOCALAPPDATA","NUMBER_OF_PROCESSORS"]) {
    if (input[key]) result[key] = input[key];
  }
  return { ...result, NEXT_TELEMETRY_DISABLED:"1", NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY:"isolated-e2e-placeholder", ...overrides };
}

export function assertDisposablePath(directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("guidon-e2e-")) throw new Error("Refusing to remove a non-test directory");
  return resolved;
}

export function allowBrowserRequest(url, origin) {
  const parsed = new URL(url);
  return parsed.origin === origin || ["data:","blob:"].includes(parsed.protocol);
}
