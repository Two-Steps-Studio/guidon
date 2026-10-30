import assert from "node:assert/strict";
import path from "node:path";

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

export async function taskQueueCoverage({ page, origin, fixture, client, browserName, artifacts }) {
  const owner = fixture.users[0];
  const previous = (await client.query("SELECT pinned_task_ids,pinned_project_ids FROM profiles WHERE id=$1", [owner.id])).rows[0];
  const project = (await client.query("SELECT avatar_url FROM projects WHERE id=$1", [owner.projectId])).rows[0];
  const ids = [];
  const previousPattern = await page.evaluate(() => localStorage.getItem("guidon-background-style")).catch(() => null);
  try {
    for (const [title, order] of [["Queue ordinary first", 1], ["Queue pinned last", 999999], ["Queue ordinary second", 2]]) {
      ids.push((await client.query("INSERT INTO tasks(project_id,created_by,title,status,sort_order) VALUES($1,$2,$3,'todo',$4) RETURNING id", [owner.projectId, owner.id, title, order])).rows[0].id);
    }
    await client.query("UPDATE profiles SET pinned_task_ids=$2,pinned_project_ids=$3 WHERE id=$1", [owner.id, [ids[1]], [owner.projectId]]);
    await client.query("UPDATE projects SET avatar_url='/brand/social/profile-avatar.png' WHERE id=$1", [owner.projectId]);
    await page.goto(origin + "/auth/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname === "/dashboard");
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    const column = page.locator('[data-column-status="todo"]');
    await column.locator("[data-card-id]").first().waitFor();
    assert.equal(await column.locator("[data-card-id]").first().getAttribute("data-card-id"), ids[1], "Personal pin leads the column despite its later saved position");
    const second = column.locator(`[data-card-id="${ids[2]}"] [data-task-open]`);
    await second.focus();await second.press("Alt+ArrowUp");
    await page.getByRole("status").filter({hasText:/Queue ordinary second.*position 2/}).waitFor();
    assert.equal(await column.locator("[data-card-id]").nth(1).getAttribute("data-card-id"), ids[2], "Keyboard reorder stays below the pinned group and announces its visible position");
    await column.locator(`[data-card-id="${ids[1]}"] [data-task-open]`).click();
    await page.getByRole("button", { name: "Unpin", exact: true }).click();
    await page.getByRole("button", { name: "Pin", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    assert.notEqual(await column.locator("[data-card-id]").first().getAttribute("data-card-id"), ids[1], "Unpin restores normal order immediately");
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    const pinnedProject = sidebar.getByRole("link", { name: owner.projectName, exact: true });
    await pinnedProject.locator("img").waitFor();
    assert.equal(await pinnedProject.locator("img").getAttribute("src"), "/brand/social/profile-avatar.png");
    await page.getByRole("button", { name: "Toggle sidebar (Ctrl+B)", exact: true }).click();
    await page.locator('[data-collapsible="icon"]').waitFor();
    const profile = sidebar.locator('a[href="/profile"]');
    const centered = await profile.evaluate(node => {
      const outer = node.getBoundingClientRect();
      const avatar = node.querySelector('[data-slot="avatar"]')?.getBoundingClientRect();
      return avatar && Math.abs(outer.x + outer.width / 2 - avatar.x - avatar.width / 2) < 1;
    });
    assert.ok(centered, "Collapsed profile avatar is centered");
    await page.goto(`${origin}/projects/${owner.projectId}/settings`);
    const labelsBefore = (await client.query("SELECT count(*)::int AS count FROM project_label_presets WHERE project_id=$1", [owner.projectId])).rows[0].count;
    await page.getByRole("button", {name:"Suggest labels with AI",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"No AI provider is configured"}).waitFor();
    assert.equal((await client.query("SELECT count(*)::int AS count FROM project_label_presets WHERE project_id=$1", [owner.projectId])).rows[0].count, labelsBefore, "Requesting suggestions never saves labels");
    await client.query("UPDATE profiles SET hide_ai=true WHERE id=$1", [owner.id]);
    await page.reload();
    assert.equal(await page.getByRole("button", {name:"Suggest labels with AI",exact:true}).count(), 0, "Hidden AI preference also hides label suggestions");
    await client.query("UPDATE profiles SET hide_ai=false WHERE id=$1", [owner.id]);
    await page.evaluate(() => localStorage.setItem("guidon-background-style", "pattern"));
    await page.goto(origin + "/profile");
    await page.locator('[data-background-pattern]').waitFor();
    await page.evaluate(() => window.scrollTo(0, 500));
    await frames(page);
    const header = page.locator("main > header");
    const before = await header.boundingBox();
    const scroll = await page.evaluate(() => scrollY);
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("menu").waitFor();
    assert.equal(await page.evaluate(() => scrollY), scroll, "Opening notifications preserves scroll");
    const after = await header.boundingBox();
    assert.ok(Math.abs(before.y - after.y) < 1 && after.y >= 0, "Sticky header stays visible while notifications are open");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await frames(page);
    const coverage = await page.locator('[data-app-background]').evaluate(node => { const r = node.getBoundingClientRect(); return r.top <= 0 && r.bottom >= innerHeight; });
    assert.ok(coverage, "Background covers the viewport at the end of settings");
    assert.notEqual(await page.locator('[data-background-pattern]').evaluate(node => node.style.transform), "translate3d(0px, 0px, 0px)", "Pattern follows page scroll");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await frames(page);
    assert.equal(await page.locator('[data-background-pattern]').evaluate(node => node.style.transform), "", "Reduced motion disables scroll movement");
    await page.screenshot({ path: path.join(artifacts, `${browserName}-task-queue.png`) });
    for (const route of ["terms","privacy","refunds","eula","cookies"]) {
      await page.goto(`${origin}/legal/${route}`);
      assert.equal(await page.getByText("Draft for review - not ready for publication.", {exact:true}).count(),0);
      assert.ok((await page.locator('meta[name="robots"]').getAttribute("content")).includes("noindex"), "Removing the banner must not claim legal approval or index unfinished documents");
    }
    const sitemap = await (await page.request.get(origin+"/sitemap.xml")).text();
    assert.doesNotMatch(sitemap,/\/auth\/login|\/auth\/signup|<lastmod>/);
    await page.goto(origin+"/auth/logout");
    await page.waitForURL(url => url.pathname === "/");
    await page.goto(origin+"/auth/login");
    assert.equal(new URL(page.url()).pathname,"/auth/login");
    assert.ok((await page.locator('meta[name="robots"]').getAttribute("content")).includes("noindex"));
  } finally {
    await page.evaluate(previous => { if (previous === null) localStorage.removeItem("guidon-background-style");else localStorage.setItem("guidon-background-style",previous); }, previousPattern).catch(() => {});
    await client.query("UPDATE profiles SET hide_ai=false WHERE id=$1", [owner.id]);
    await client.query("UPDATE profiles SET pinned_task_ids=$2,pinned_project_ids=$3 WHERE id=$1", [owner.id, previous.pinned_task_ids, previous.pinned_project_ids]);
    await client.query("UPDATE projects SET avatar_url=$2 WHERE id=$1", [owner.projectId, project.avatar_url]);
    await client.query("DELETE FROM tasks WHERE id=ANY($1::uuid[])", [ids]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
}
