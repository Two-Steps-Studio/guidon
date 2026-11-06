import assert from "node:assert/strict";

export async function adminRbacCoverage({ page, origin, fixture, client }) {
  const owner = fixture.users[0];
  const setRole = async (role) => {
    await client.query("UPDATE platform_admin_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [owner.id]);
    if (role) await client.query("INSERT INTO platform_admin_grants (user_id, role) VALUES ($1, $2)", [owner.id, role]);
  };

  const signIn = async (email) => {
    await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname === "/dashboard");
  };
  await signIn(owner.email);

  await page.goto(`${origin}/admin`);
  await page.waitForURL(url => url.pathname === "/dashboard");
  await setRole("super_admin");
  await page.goto(`${origin}/admin/organizations`);
  const editor = page.getByRole("spinbutton").first();
  await editor.waitFor();
  const save = editor.locator("..").getByRole("button", { name: "Save", exact: true });
  const limits = async () => (await client.query("SELECT id, project_limit FROM organizations ORDER BY id")).rows;
  const initial = await limits();
  await editor.fill("17");
  await save.click();
  await editor.locator("..").getByRole("status").waitFor();
  const before = await limits();
  assert.notDeepEqual(before, initial);
  const editedOrg = before.find((org, index) => org.project_limit !== initial[index].project_limit);
  const events = async () => (await client.query(
    "SELECT actor_id, action, target_id, outcome, request_id, before_state, after_state FROM platform_admin_audit_events ORDER BY created_at, id",
  )).rows;
  const [requested, succeeded] = await events();
  assert.equal(requested.action, "organizations.limits.edit.requested");
  assert.equal(succeeded.action, "organizations.limits.edit");
  assert.equal(succeeded.actor_id, owner.id);
  assert.equal(succeeded.target_id, editedOrg.id);
  assert.equal(succeeded.request_id, requested.request_id);
  assert.equal(succeeded.outcome, "succeeded");
  assert.deepEqual(succeeded.before_state, { project_limit: initial.find(org => org.id === editedOrg.id).project_limit });
  assert.deepEqual(succeeded.after_state, { project_limit: 17 });
  await editor.fill("18");

  // A stale tab still has the privileged control and can issue its POST.
  // The Server Action must check the current grant before writing.
  await setRole("finance");
  const post = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
  await save.click();
  await post;
  await page.waitForURL(url => url.pathname === "/admin");
  assert.deepEqual(await limits(), before);
  const denied = (await events()).at(-1);
  assert.equal(denied.actor_id, owner.id);
  assert.equal(denied.outcome, "denied");
  assert.equal(denied.after_state, null);
  await page.goto(`${origin}/admin/audit`);
  await page.waitForURL(url => url.pathname === "/admin");
  await setRole("super_admin");
  await page.goto(`${origin}/admin/audit?actor=${owner.id}&type=organization&target=${editedOrg.id}&outcome=denied`);
  await page.getByRole("heading", { name: "Admin audit", exact: true }).waitFor();
  await page.locator("main ol li").first().waitFor();
  assert.equal(await page.locator("main ol li").count(), 1);
  assert.match(await page.locator("main ol li").textContent(), /organizations\.limits\.edit · Denied/);

  const { rows: [privileges] } = await client.query(`
    SELECT
      has_table_privilege('service_role', 'platform_admin_audit_events', 'UPDATE, DELETE, TRUNCATE') AS can_rewrite,
      has_table_privilege('authenticated', 'platform_admin_audit_events', 'SELECT, INSERT') AS user_access
  `);
  assert.deepEqual(privileges, { can_rewrite: false, user_access: false });

  await client.query(`
    INSERT INTO platform_admin_audit_events (actor_id, action, target_type, outcome, request_id, created_at)
    SELECT $1, 'billing.prices.sync', 'billing', 'succeeded', gen_random_uuid(), '2025-01-01 10:00:00.123456+00'
    FROM generate_series(1, 51)
  `, [owner.id]);
  await page.goto(`${origin}/admin/audit?action=billing.prices.sync`);
  await page.locator("main ol li").last().waitFor();
  assert.equal(await page.locator("main ol li").count(), 50);
  const firstPageRequests = await page.locator('main ol a[href*="?request="]').allTextContents();
  await page.getByRole("link", { name: "Older events" }).click();
  await page.waitForURL(url => url.searchParams.has("cursor"));
  await page.locator("main ol li").first().waitFor();
  assert.equal(await page.locator("main ol li").count(), 1);
  assert.ok(!firstPageRequests.includes(await page.locator('main ol a[href*="?request="]').textContent()));
  await setRole("finance");
  await page.goto(`${origin}/admin/organizations`);
  await page.locator("main table").waitFor();
  assert.equal(await page.getByRole("spinbutton").count(), 0);
  assert.equal(await page.locator('a[href="/admin/users"]').count(), 0);
  await page.goto(`${origin}/admin/users`);
  await page.waitForURL(url => url.pathname === "/admin");

  await setRole("support");
  await page.goto(`${origin}/admin/users`);
  await page.locator("main table").waitFor();
  await page.goto(`${origin}/admin/billing`);
  await page.waitForURL(url => url.pathname === "/admin");

  await setRole("engineering");
  await page.goto(`${origin}/admin/search`);
  assert.equal(new URL(page.url()).pathname, "/admin/search");
  assert.equal(await page.locator('a[href="/admin/organizations"]').count(), 0);

  await setRole("read_only");
  await page.goto(`${origin}/admin/organizations`);
  await page.waitForURL(url => url.pathname === "/admin");
  assert.equal(await page.locator('a[href="/admin/organizations"]').count(), 0);
  assert.equal(await page.getByRole("heading", { name: "System status", exact: true }).count(), 0);
  await setRole(null);
  await page.goto(`${origin}/admin`);
  await page.waitForURL(url => url.pathname === "/dashboard");

  // Even a granted account cannot spoof the allowlist through a profile field.
  const outsider = fixture.users[1];
  await client.query("INSERT INTO platform_admin_grants (user_id, role) VALUES ($1, 'super_admin')", [outsider.id]);
  await client.query("UPDATE profiles SET email = 'profile-only@guidon.example.test' WHERE id = $1", [owner.id]);
  await client.query("UPDATE profiles SET email = $1 WHERE id = $2", [owner.email, outsider.id]);
  await page.goto(`${origin}/auth/logout`);
  await page.waitForURL(url => url.pathname === "/");
  await signIn(outsider.email);
  await page.goto(`${origin}/admin`);
  await page.waitForURL(url => url.pathname === "/dashboard");
}
