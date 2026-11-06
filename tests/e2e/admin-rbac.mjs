import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

  const target = fixture.users[1];
  await page.goto(`${origin}/admin/users`);
  const userTable = page.locator("main table");
  const targetRow = userTable.getByRole("row").filter({ hasText: target.id });
  const reveal = targetRow.getByRole("button", { name: "Reveal profile" });
  await reveal.waitFor();
  assert.ok(!(await userTable.textContent()).includes(target.email));
  await reveal.click();
  await targetRow.getByText(target.email, { exact: true }).waitFor();
  await targetRow.getByRole("button", { name: "Hide profile" }).click();
  assert.ok(!(await targetRow.textContent()).includes(target.email));
  const { rows: [disclosure] } = await client.query(
    "SELECT actor_id, target_id, outcome, before_state, after_state FROM platform_admin_audit_events WHERE action = 'users.pii.reveal'",
  );
  assert.deepEqual(disclosure, {
    actor_id: owner.id, target_id: target.id, outcome: "succeeded", before_state: null, after_state: null,
  });
  // Database-side requests and the browser share the same per-actor quota.
  const { rows: [grant] } = await client.query(
    "SELECT has_function_privilege('authenticated', 'public.platform_admin_reveal_profile(uuid,uuid,uuid)', 'EXECUTE') AS allowed",
  );
  assert.equal(grant.allowed, false);
  await client.query(
    "SELECT public.platform_admin_reveal_profile($1, $2, gen_random_uuid()) FROM generate_series(1, 9)",
    [owner.id, target.id],
  );
  await reveal.click();
  await targetRow.getByRole("alert").getByText(/Disclosure limit reached/).waitFor();
  assert.ok(!(await targetRow.textContent()).includes(target.email));
  await setRole("support");
  await reveal.click();
  await page.waitForURL(url => url.pathname === "/admin");
  const { rows: [denial] } = await client.query(
    "SELECT count(*)::int AS total FROM platform_admin_audit_events WHERE action = 'users.pii.reveal' AND outcome = 'denied'",
  );
  assert.equal(denial.total, 1);

  await setRole("super_admin");
  await page.goto(`${origin}/admin`);
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "Search users" }).click();
  await page.waitForURL(url => url.pathname === "/admin/users");
  await page.getByLabel("Search by").selectOption("email");
  await page.getByLabel("Search value").fill(target.email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await userTable.getByRole("row").nth(2).waitFor({ state: "detached" });
  assert.equal(await userTable.getByRole("row").count(), 2);
  assert.ok(!(await userTable.textContent()).includes(target.email));
  assert.ok(!page.url().includes(encodeURIComponent(target.email)));
  await targetRow.getByRole("link", { name: target.id }).click();
  await page.getByRole("heading", { name: "User details" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Account operations" }).count(), 0);
  assert.ok(!(await page.locator("main").textContent()).includes(target.email));
  const { rows: [searchAudit] } = await client.query(
    "SELECT target_id, before_state, after_state FROM platform_admin_audit_events WHERE action = 'users.directory.search' AND outcome = 'succeeded'",
  );
  assert.deepEqual(searchAudit, { target_id: null, before_state: null, after_state: null });
  await page.getByLabel("Private note").fill("Synthetic private note");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByText("Synthetic private note", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Pin note", exact: true }).click();
  await page.getByRole("button", { name: "Unpin note", exact: true }).waitFor();
  await page.goto(`${origin}/admin/flags`);
  const flag = JSON.parse(await page.getByLabel("Configuration").inputValue());
  await page.getByLabel("Configuration").fill(JSON.stringify({ ...flag, killed: true }));
  await page.getByRole("button", { name: "Save flag" }).click();
  await page.getByText("Flag saved.", { exact: true }).waitFor();
  await page.goto(`${origin}/admin/users/bulk`);
  await page.getByLabel("Up to 25 account IDs").fill(target.id);
  await page.getByLabel("Tag", { exact: true }).fill("synthetic");
  await page.getByRole("button", { name: "Preview changes" }).click();
  await page.getByText(`${target.id} · ready`, { exact: true }).waitFor();
  assert.equal((await client.query("SELECT 1 FROM platform_admin_user_tags WHERE user_id = $1", [target.id])).rowCount, 0);
  await page.getByLabel("Type APPLY to confirm").fill("APPLY");
  await page.getByRole("button", { name: "Apply tag" }).click();
  await page.getByText(`${target.id} · saved`, { exact: true }).waitFor();
  await page.getByLabel("Optional tag filter").fill("synthetic");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const csv = await readFile(await (await download).path(), "utf8");
  assert.match(csv, /^user_id,created_at\r\n/);
  assert.ok(csv.includes(target.id));
  assert.ok(!csv.includes(target.email));
  const { rows: operationalAudit } = await client.query(`
    SELECT action FROM platform_admin_audit_events
    WHERE outcome = 'succeeded' AND action IN ('users.support.manage', 'flags.manage', 'users.bulk')
  `);
  assert.equal(operationalAudit.length, 5);
  await setRole("finance");
  const invoice = {
    invoice_id: "in_fixture", organization_id: fixture.users[0].organizationId, invoice_number: "TEST-001",
    status: "paid", currency: "eur", amount_due: 1200, amount_paid: 1200, amount_remaining: 0,
    attempt_count: 2, invoice_pdf: "https://pay.stripe.com/test-invoice.pdf", card_last4: "4242",
    issued_at: "2025-01-01T00:00:00Z", observed_at: "2025-01-02T00:00:00Z", failed_at: null,
  };
  const history = [{ id: "inpay_fixture", status: "paid", currency: "eur", amount: 1200, recordedAt: invoice.observed_at, last4: "4242" }];
  const saveInvoice = (snapshot, payments = history) => client.query(
    "SELECT platform_stripe_save_invoice_history($1, $2)", [snapshot, JSON.stringify(payments)],
  );
  await saveInvoice(invoice);
  await saveInvoice(invoice);
  await saveInvoice({
    ...invoice, status: "open", amount_paid: 0, amount_remaining: 1200,
    observed_at: "2025-01-01T01:00:00Z", failed_at: "2025-01-01T01:00:00Z",
  }, []);
  const { rows: savedInvoices } = await client.query(
    "SELECT status, failed_at FROM platform_stripe_invoices WHERE invoice_id = $1", [invoice.invoice_id],
  );
  assert.equal(savedInvoices.length, 1);
  assert.equal(savedInvoices[0].status, "paid");
  assert.equal(savedInvoices[0].failed_at.toISOString(), "2025-01-01T01:00:00.000Z");
  await page.goto(`${origin}/admin/billing/invoices`);
  await page.getByRole("heading", { name: "Stripe invoices" }).waitFor();
  await page.getByRole("link", { name: "Invoice PDF" }).waitFor();
  await page.getByText("Payment history", { exact: true }).click();
  await page.getByText(/paid.*12\.00.*4242/).waitFor();
  assert.match(await page.locator("main table").textContent(), /TEST-001.*paid.*4242/);
  await saveInvoice({ ...invoice, invoice_id: "in_open", invoice_number: "TEST-002",
    status: "open", amount_paid: 0, amount_remaining: 1200, failed_at: invoice.observed_at,
  }, []);
  await page.getByRole("link", { name: "Collections queue" }).click();
  await page.getByRole("heading", { name: "Collections queue" }).waitFor();
  await page.getByText("TEST-002", { exact: false }).waitFor();
  assert.equal(await page.getByText("TEST-001", { exact: false }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Retry payment" }).count(), 0);
  await page.goto(`${origin}/admin/organizations`);
  await page.locator("main table").waitFor();
  assert.equal(await page.getByRole("spinbutton").count(), 0);
  assert.equal(await page.locator('a[href="/admin/users"]').count(), 0);
  await page.goto(`${origin}/admin/users`);
  await page.waitForURL(url => url.pathname === "/admin");

  await setRole("support");
  await page.goto(`${origin}/admin/users`);
  await page.locator("main table").waitFor();
  assert.deepEqual(await page.getByLabel("Search by").locator("option").allTextContents(), ["User ID", "Account tag"]);
  assert.equal(await page.getByRole("button", { name: "Reveal profile" }).count(), 0);
  await page.goto(`${origin}/admin/users/${target.id}`);
  await page.getByLabel("Reason").selectOption("access");
  await page.getByRole("button", { name: "Start read-only preview" }).click();
  await page.waitForURL(url => url.pathname.includes("/diagnostics/"));
  const preview = page.url();
  await page.getByText("Read-only diagnostic preview · 15-minute session").waitFor();
  assert.ok(!(await page.locator("main").textContent()).includes(target.email));
  assert.equal(await page.getByRole("button", { name: "Reveal profile" }).count(), 0);
  await page.getByRole("button", { name: "Exit preview" }).click();
  await page.waitForURL(url => url.pathname === `/admin/users/${target.id}`);
  await page.goto(preview);
  await page.getByText(/page could not be found/i).waitFor();
  const { rows: [expired] } = await client.query(
    "INSERT INTO platform_admin_diagnostics (actor_id, target_id, reason, expires_at) VALUES ($1, $2, 'support', now() - interval '1 second') RETURNING id",
    [owner.id, target.id],
  );
  await page.goto(`${origin}/admin/users/${target.id}/diagnostics/${expired.id}`);
  await page.getByText(/page could not be found/i).waitFor();
  const { rows: diagnosticAudits } = await client.query(
    "SELECT action FROM platform_admin_audit_events WHERE target_id = $1 AND action IN ('users.diagnostics.start', 'users.diagnostics.end') AND outcome = 'succeeded' ORDER BY action",
    [target.id],
  );
  assert.deepEqual(diagnosticAudits.map(row => row.action), ["users.diagnostics.end", "users.diagnostics.start"]);
  await page.goto(`${origin}/admin/billing`);
  await page.waitForURL(url => url.pathname === "/admin");
  await page.goto(`${origin}/admin/billing/invoices`);
  await page.waitForURL(url => url.pathname === "/admin");

  await setRole("engineering");
  const { rows: [webhook] } = await client.query(`
    INSERT INTO organization_webhooks (organization_id, url, events, secret_encrypted, enabled)
    VALUES ($1, 'https://example.test/webhook', ARRAY['task.created'], 'synthetic', false) RETURNING id
  `, [owner.organizationId]);
  const { rows: [job] } = await client.query(`
    INSERT INTO organization_webhook_deliveries (webhook_id, organization_id, event_type, payload, status, attempts)
    VALUES ($1, $2, 'task.created', '{}', 'failed', 1) RETURNING id
  `, [webhook.id, owner.organizationId]);
  await client.query(`
    INSERT INTO module_reports (module_id, version, reporter_id, reason)
    VALUES ('release-planning', '1.0.0', $1, 'spam')
  `, [target.id]);
  await page.goto(`${origin}/admin/operations`);
  await page.getByRole("link", { name: "Open abuse reports" }).waitFor();
  await page.locator("li").filter({ hasText: job.id }).getByRole("button", { name: "Schedule retry" }).click();
  await page.getByText("Retry scheduled.", { exact: true }).waitFor();
  assert.equal((await client.query("SELECT status FROM organization_webhook_deliveries WHERE id = $1", [job.id])).rows[0].status, "pending");
  await page.goto(`${origin}/admin/search`);
  assert.equal(new URL(page.url()).pathname, "/admin/search");
  assert.equal(await page.locator('a[href="/admin/organizations"]').count(), 0);

  await setRole("read_only");
  const snapshot = async () => {
    await client.query("SELECT platform_admin_refresh_usage()");
    return (await client.query("SELECT dau::int, wau::int, mau::int FROM platform_admin_usage_snapshots ORDER BY day DESC LIMIT 1")).rows[0];
  };
  const baseline = await snapshot();
  const { rows: [{ id: dayUser }, { id: weekUser }, { id: monthUser }, { id: botUser }] } = await client.query(`
    INSERT INTO auth.users(email) SELECT 'metric-' || n || '@example.test' FROM generate_series(1, 4) AS g(n) RETURNING id
  `);
  await client.query(`
    WITH utc AS (SELECT date_trunc('day', timezone('UTC', now())) AT TIME ZONE 'UTC' AS boundary)
    INSERT INTO activity_logs(user_id, action, created_at, actor_label)
    SELECT events.user_id::uuid, 'metric_fixture', utc.boundary - events.age::interval, events.actor
    FROM utc CROSS JOIN (VALUES
      ($1::text, '1 hour', NULL::text), ($1, '2 hours', NULL),
      ($2, '2 days', NULL), ($3, '15 days', NULL), ($4, '1 hour', 'Bot'), ($4, '0 hours', NULL)
    ) AS events(user_id, age, actor)
  `, [dayUser, weekUser, monthUser, botUser]);
  const usage = await snapshot();
  assert.deepEqual(usage, { dau: baseline.dau + 1, wau: baseline.wau + 2, mau: baseline.mau + 3 });
  assert.deepEqual(await snapshot(), usage);
  await page.goto(`${origin}/admin/funnel`);
  await page.getByRole("heading", { name: "Active users" }).waitFor();
  assert.equal(await page.locator("#funnel-usage + p + table tbody tr").count(), 1);
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

  // Synthetic workload in the disposable database. Report database round-trip
  // p95 independently of browser/network latency and avoid CI timing thresholds.
  await client.query(`
    INSERT INTO auth.users (email, raw_user_meta_data)
    SELECT 'perf-' || n || '@bench.example.test', jsonb_build_object('full_name', 'Synthetic ' || n)
    FROM generate_series(1, 10000) AS g(n)
  `);
  await client.query("ANALYZE public.profiles");
  const query = "SELECT * FROM public.platform_admin_search_profiles($1, $2, $3)";
  const { rows: [stripeOwner] } = await client.query(
    "SELECT organization_id, user_id FROM organization_members WHERE role = 'owner' LIMIT 1",
  );
  await client.query(
    "UPDATE subscriptions SET stripe_customer_id = 'cus_adminfixture' WHERE organization_id = $1",
    [stripeOwner.organization_id],
  );
  assert.ok((await client.query(query, ["stripe", "cus_adminfixture", null])).rows.some(row => row.id === stripeOwner.user_id));
  assert.equal((await client.query(query, ["email", "perf-42@bench.example.test", null])).rows.length, 1);
  assert.equal((await client.query(query, ["name", "Synthetic", null])).rows.length, 26);
  const domainPage = (await client.query(query, ["domain", "bench.example.test", null])).rows;
  assert.equal(domainPage.length, 26);
  const later = (await client.query(query, ["domain", "bench.example.test", domainPage[24].id])).rows;
  assert.equal(later[0].id, domainPage[25].id);
  for (const [kind, term] of [["email", "perf-42@bench.example.test"], ["name", "Synthetic"], ["domain", "bench.example.test"], ["stripe", "cus_adminfixture"]]) {
    const samples = [];
    for (let sample = 0; sample < 40; sample++) {
      const start = performance.now();
      await client.query(query, [kind, term, null]);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    console.log(`Admin directory ${kind} p95 (${samples.length} queries, 10,000 synthetic profiles): ${samples[Math.ceil(samples.length * 0.95) - 1].toFixed(1)} ms`);
  }
}
