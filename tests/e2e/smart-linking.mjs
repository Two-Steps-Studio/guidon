import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/**
 * Smart Linking (migration 097) through the real webhook and UI: a PR that
 * references a task becomes a confirmed link whose state follows the PR, a
 * PR without a reference only suggests the matching task (never an
 * unrelated one), the owner confirms and rejects in the task dialog, a
 * rejection survives later events, and a disconnected repository is flagged.
 * The webhook secret is a disposable per-run value (run.mjs).
 */
export async function smartLinkingCoverage({ page, context, origin, fixture, client, browserName, webhookSecret }) {
  const owner = fixture.users[0];
  const repo = { name: `web-${browserName}`, owner: { login: "acme" } };
  const send = async (event, body) => {
    const raw = JSON.stringify({ repository: repo, installation: { id: 4242 }, ...body });
    const response = await context.request.post(`${origin}/api/github/webhook`, { headers: { "content-type": "application/json", "x-github-event": event, "x-hub-signature-256": `sha256=${createHmac("sha256", webhookSecret).update(raw).digest("hex")}` }, data: raw });
    assert.equal(response.status(), 200, await response.text());
  };
  const pr = (action, number, title, extra = {}) => send("pull_request", { action, number, pull_request: { title, body: "", html_url: `https://github.com/acme/${repo.name}/pull/${number}`, head: { ref: `b${number}` }, base: { ref: "main" }, user: { login: "dev" }, updated_at: new Date().toISOString(), ...extra } });
  let related, unrelated;
  await client.query("INSERT INTO github_connections(project_id, connected_by, github_login, repo_owner, repo_name, default_branch, installation_id, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at) VALUES($1,$2,'qa','acme',$3,'main',4242,'unused','unused',now()+interval '1 day',now()+interval '30 days') ON CONFLICT (project_id) DO UPDATE SET repo_owner='acme', repo_name=EXCLUDED.repo_name, installation_id=4242", [owner.projectId, owner.id, repo.name]);
  try {
    related = (await client.query("INSERT INTO tasks(project_id,title,status,created_by) VALUES($1,$2,'todo',$3) RETURNING id", [owner.projectId, `Login redirect loops after password reset ${browserName}`, owner.id])).rows[0].id;
    unrelated = (await client.query("INSERT INTO tasks(project_id,title,status,created_by) VALUES($1,'Dashboard chart colors','todo',$2) RETURNING id", [owner.projectId, owner.id])).rows[0].id;
    await pr("opened", 7, `Fix redirect guidon#${related.slice(0, 8)}`);
    await pr("opened", 8, "Stop the login redirect loop after a password reset");
    await pr("closed", 7, `Fix redirect guidon#${related.slice(0, 8)}`, { merged: true });
    const links = async () => (await client.query("SELECT task_id, external_ref, status, provenance, confidence::float AS confidence, pr_state, decided_by FROM task_links WHERE project_id=$1 AND repository=$2 ORDER BY external_ref", [owner.projectId, `acme/${repo.name}`])).rows;
    const created = await links();
    assert.deepEqual(created.map((row) => [row.task_id === related, row.external_ref, row.status, row.provenance, row.pr_state]), [[true, "7", "confirmed", "explicit_reference", "merged"], [true, "8", "suggested", "suggestion", "open"]]);
    assert.ok(created[1].confidence < 1, "A suggestion is never certain");
    assert.equal(created.some((row) => row.task_id === unrelated), false, "No suggestion for an unrelated task");

    await context.clearCookies(); await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(owner.email); await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL((url) => url.pathname === "/dashboard");
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    await page.locator(`article[data-card-id="${related}"] [data-task-open]`).click();
    const panel = page.getByRole("region", { name: "Linked code" });
    await panel.getByText(`acme/${repo.name}#8`).waitFor();
    await panel.getByText(/Suggestion · \d+%/).waitFor();
    await panel.getByRole("button", { name: "Confirm", exact: true }).click();
    await panel.getByText(/Suggestion · /).waitFor({ state: "detached" });
    await panel.getByRole("button", { name: `Mark acme/${repo.name}#7 as not related`, exact: true }).click();
    await panel.getByText(`acme/${repo.name}#7`).waitFor({ state: "detached" });
    const reviewed = await links();
    assert.deepEqual(reviewed.map((row) => [row.external_ref, row.status, row.decided_by === owner.id]), [["7", "rejected", true], ["8", "confirmed", true]]);

    await pr("reopened", 7, `Fix redirect guidon#${related.slice(0, 8)}`);
    assert.equal((await links())[0].status, "rejected", "A rejection survives later events");
    const events = (await client.query("SELECT event_type FROM context_events WHERE entity_id=$1 AND event_type LIKE 'task.link_%'", [related])).rows.map((row) => row.event_type);
    for (const type of ["task.link_created", "task.link_suggested", "task.link_confirmed", "task.link_rejected", "task.link_pr_state"]) assert.ok(events.includes(type), `${type} in ${events}`);

    await client.query("UPDATE github_connections SET repo_name='moved' WHERE project_id=$1", [owner.projectId]);
    await page.reload();
    await page.locator(`article[data-card-id="${related}"] [data-task-open]`).click();
    await panel.getByText("Repository no longer connected").first().waitFor();
  } finally {
    await client.query("DELETE FROM github_connections WHERE project_id=$1", [owner.projectId]);
    if (related) await client.query("DELETE FROM tasks WHERE id = ANY($1)", [[related, unrelated].filter(Boolean)]);
    await context.clearCookies();
  }
}
