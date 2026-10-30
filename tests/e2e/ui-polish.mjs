import assert from "node:assert/strict";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const settled = locator => locator.evaluate(async node => {
  await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
});

/** Exercises the real shared surfaces, not copies of their CSS or components. */
export async function uiPolishCoverage({ page, context, origin, fixture, client, artifacts }) {
  const owner = fixture.users[0];
  const previous = (await client.query("SELECT full_name,email FROM profiles WHERE id=$1", [owner.id])).rows[0];
  const longEmail = "bartholomew.fitzgerald@northwind-industries-holdings.example.com";
  const errors = [];
  const onError = error => errors.push(error.message);
  let taskId;
  page.on("pageerror", onError);
  try {
    await page.goto(origin + "/auth/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname === "/dashboard");
    await client.query("UPDATE profiles SET full_name='🦊 Fox',email=$2 WHERE id=$1", [owner.id, longEmail]);
    taskId = (await client.query("INSERT INTO tasks(project_id,created_by,title,tags) VALUES($1,$2,$3,$4) RETURNING id", [owner.projectId, owner.id, "UI polish regression fixture", ["customerFeedbackFromEnterpriseOnboarding"]])).rows[0].id;

    await page.setViewportSize({ width: 320, height: 1000 });
    for (const route of ["/profile", `/organizations/${owner.organizationId}/members`]) {
      await page.goto(origin + route);
      const email = page.locator("main").getByText(longEmail, { exact: true }).first();
      await email.waitFor();
      assert.ok(await email.evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1), "Long email must fit on a phone");
    }
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    // A drag preview can contain a presentation copy of a card in a portal.
    // Exercise the actual card inside the visible board, not that copy.
    const card = page.getByRole("list", {name:"Task board",exact:true}).locator(`[data-card-id="${taskId}"]`);
    await card.scrollIntoViewIfNeeded();
    assert.ok(await card.evaluate(node => [...node.querySelectorAll("ul li")].every(label => label.getBoundingClientRect().right <= node.getBoundingClientRect().right + 1)), "Long labels must fit inside their card");
    await page.screenshot({ path: path.join(artifacts, "ui-polish-phone.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 1000 });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations, [], "The board must pass the selected accessibility rules");
    await page.locator('button[data-sidebar="trigger"]').focus();
    await page.keyboard.press("Control+k");
    const dialog = page.locator('[data-slot="dialog-content"]');
    await dialog.waitFor();
    for (const slot of ["dialog-content", "dialog-overlay"]) {
      assert.equal(await page.locator(`[data-slot="${slot}"]`).evaluate(node => getComputedStyle(node).animationName), "none");
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.keyboard.press("Control+b");
    await frames(page);
    assert.ok(await page.locator('[data-sidebar="sidebar"]').evaluate(node => !node.getAnimations({ subtree: true }).some(animation => animation.effect?.getKeyframes().some(frame => ["width", "height", "padding", "margin"].some(key => key in frame)))), "Sidebar collapse must not animate layout");
    await page.keyboard.press("Control+b");

    await card.locator("[data-task-open]").click();
    await dialog.waitFor();
    await settled(dialog);
    await page.getByRole("button", { name: "Copy task ID", exact: true }).click();
    const toast = page.locator("[data-sonner-toast]").first();
    await toast.waitFor();
    await settled(toast);
    assert.ok(await toast.evaluate(node => { const r = node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), "Toast must appear above the modal overlay");
    await toast.locator("[data-close-button]").click();
    assert.ok(await dialog.isVisible(), "Dismissing a toast must preserve the editor and its draft");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await card.locator("[data-task-open]").click();
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(node => getComputedStyle(node).animationName), "ui-fade-in");
    assert.ok(await dialog.evaluate(node => node.getAnimations().every(animation => animation.effect?.getKeyframes().every(frame => !("transform" in frame) && !("translate" in frame)))));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.deepEqual(errors.filter(message => /hydration|server rendered text/i.test(message)), [], "Emoji initials must hydrate without mismatches");
    await page.screenshot({ path: path.join(artifacts, "ui-polish-desktop.png") });
  } finally {
    page.off("pageerror", onError);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await client.query("UPDATE profiles SET full_name=$2,email=$3 WHERE id=$1", [owner.id, previous.full_name, previous.email]);
    if (taskId) await client.query("DELETE FROM tasks WHERE id=$1 AND project_id=$2", [taskId, owner.projectId]);
  }
  await page.goto(origin + "/auth/logout");
  await page.waitForURL(url => url.pathname === "/");
}
