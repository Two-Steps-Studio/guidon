import { NextRequest, NextResponse } from "next/server";
import { applyActions, findConnections, verifyGithubSignature } from "@/lib/github/webhook";
import { planPullRequest, planPush, type TaskAction } from "@/lib/github/task-refs";

/** GitHub's own limit for webhook payloads is 25MB; anything bigger isn't from GitHub. */
const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * GitHub App webhook: commits and pull requests that mention a task
 * (`guidon#1a2b3c4d`) become a comment on it, and move it - a commit starts
 * unstarted work (In Progress), an opened PR moves it to Review, a PR merged
 * into the default branch to Done. Rules: src/lib/github/task-refs.ts.
 *
 * Authenticated by the App's webhook secret (GITHUB_APP_WEBHOOK_SECRET,
 * X-Hub-Signature-256), not a session or API key - hence listed in
 * src/proxy.ts's public routes. Which project(s) an event belongs to comes
 * from github_connections (the repository connected on the Files page), and
 * every write happens as the person who connected it, under RLS.
 *
 * Always answers 2xx for a verified delivery once it's been processed, even
 * when nothing matched: GitHub retries non-2xx responses, and a retry can't
 * make an unknown task appear.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "GitHub webhook is not configured on this server." }, { status: 503 });
  }

  // GitHub always sends Content-Length; requiring it keeps an unsigned,
  // chunked body from being buffered without limit before the signature check.
  const declaredLength = Number(request.headers.get("content-length"));
  if (!request.headers.get("content-length") || !Number.isFinite(declaredLength)) {
    return NextResponse.json({ error: "Content-Length is required." }, { status: 411 });
  }
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const rawBody = await request.text();
  if (!verifyGithubSignature(rawBody, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = request.headers.get("x-github-event") ?? "";
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "push" && event !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: event });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const repository = payload.repository as { name?: unknown; owner?: { login?: unknown; name?: unknown } } | undefined;
  const owner = String(repository?.owner?.login ?? repository?.owner?.name ?? "");
  const name = String(repository?.name ?? "");
  const installation = payload.installation as { id?: unknown } | undefined;
  const installationId = typeof installation?.id === "number" ? installation.id : null;

  const targets = await findConnections(owner, name, installationId);
  if (targets.length === 0) return NextResponse.json({ ok: true, projects: 0 });

  let applied = 0;
  const skipped: string[] = [];
  for (const target of targets) {
    const actions: TaskAction[] = event === "push" ? planPush(payload) : planPullRequest(payload, target.defaultBranch);
    // One broken connection (e.g. the person who connected it lost access to
    // the project) must not fail the delivery for the others - a 5xx makes
    // GitHub redeliver to all of them.
    try {
      const outcome = await applyActions(target, actions);
      applied += outcome.applied;
      skipped.push(...outcome.skipped);
    } catch (error) {
      console.error("[GitHub webhook] project", target.projectId, error);
      skipped.push(`project ${target.projectId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  return NextResponse.json({ ok: true, projects: targets.length, applied, skipped });
}
