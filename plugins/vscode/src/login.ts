import { createServer, Server } from "node:http";
import { randomBytes } from "node:crypto";

export const PORT_RANGE = [51820, 51829] as const;
export const TIMEOUT_MS = 5 * 60 * 1000;

export type LoginResult = { ok: true; apiKey: string; email: string } | { ok: false; error: string };

/**
 * Browser login - the same loopback flow as the other Guidon plugins (and
 * `gh auth login`): listen on 127.0.0.1, open
 * /auth/plugin-login?client=vscode with that listener as redirect_uri, and
 * receive the issued API key once the user clicks Authorize. The extension
 * never sees a password. No vscode import, so it's testable in plain Node.
 *
 * Needs the extension host on the same machine as the browser (a local
 * window); in Remote/Codespaces the loopback isn't reachable - see README.
 */
export async function login(
  baseUrl: string,
  openBrowser: (url: string) => Promise<unknown> | unknown,
  cancel?: { cancelled: boolean },
  timeoutMs = TIMEOUT_MS
): Promise<LoginResult> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, error: "Set guidon.baseUrl first." };

  const state = randomBytes(16).toString("hex");
  let settle: (result: LoginResult) => void = () => undefined;
  const received = new Promise<LoginResult>((resolve) => (settle = resolve));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const apiKey = url.searchParams.get("apiKey") ?? "";
    const ok = apiKey !== "" && url.searchParams.get("state") === state;
    const [title, message] = ok
      ? ["Logged in", "You're logged in - you can close this tab and return to VS Code."]
      : ["Login failed", "Something went wrong - return to VS Code and try again."];
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<html><head><title>Guidon</title></head><body style="font-family:sans-serif;text-align:center;padding-top:80px;"><h2>${title}</h2><p>${message}</p></body></html>`
    );
    settle(ok ? { ok: true, apiKey, email: url.searchParams.get("email") ?? "" } : { ok: false, error: "Login was not completed, or the response could not be verified." });
  });

  const port = await listenOnFirstFreePort(server);
  if (port === null) {
    return { ok: false, error: `Could not open a local port for browser login (tried ${PORT_RANGE[0]}-${PORT_RANGE[1]}). Close any other Guidon login attempt and try again.` };
  }

  try {
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const url = `${base}/auth/plugin-login?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&client=vscode`;
    try {
      await openBrowser(url);
    } catch (error) {
      return { ok: false, error: `Could not open a browser: ${error instanceof Error ? error.message : error}` };
    }

    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (cancel?.cancelled) return { ok: false, error: "Login cancelled." };
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { ok: false, error: "Login timed out - no response from the browser within 5 minutes." };
      const result = await Promise.race([received, new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.min(250, remaining)))]);
      if (result) return result;
    }
  } finally {
    server.close();
  }
}

async function listenOnFirstFreePort(server: Server): Promise<number | null> {
  for (let port = PORT_RANGE[0]; port <= PORT_RANGE[1]; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      const onError = () => resolve(false);
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", onError);
        resolve(true);
      });
    });
    if (ok) return port;
  }
  return null;
}
