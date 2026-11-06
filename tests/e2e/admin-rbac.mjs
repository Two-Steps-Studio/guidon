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
  await editor.fill("18");

  // A stale tab still has the privileged control and can issue its POST.
  // The Server Action must check the current grant before writing.
  await setRole("finance");
  const post = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
  await save.click();
  await post;
  await page.waitForURL(url => url.pathname === "/admin");
  assert.deepEqual(await limits(), before);
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
