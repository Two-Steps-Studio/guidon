import assert from "node:assert/strict";
import path from "node:path";

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Regression scenarios from the second UI audit. All records are disposable. */
export async function auditFollowupCoverage({ page, origin, fixture, client, artifacts }) {
  const owner = fixture.users[0];
  const root = `${origin}/projects/${owner.projectId}`;
  const taskIds = [], fileIds = [], downloads = [];
  const onDownload = download => downloads.push(download);
  const denyStorage = route => {
    const filePath = new URL(route.request().url()).searchParams.get("path") ?? "";
    return filePath.includes("audit-followup/")
      ? route.fulfill({ status: 403, contentType: "text/plain", body: "Simulated audit storage denial" })
      : route.continue();
  };
  try {
    await page.goto(origin + "/auth/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname === "/dashboard");

    await page.goto(root + "/settings");
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");canvas.width = canvas.height = 64;
      const context = canvas.getContext("2d");
      context.fillStyle = "red";context.fillRect(0, 0, 32, 64);
      context.fillStyle = "blue";context.fillRect(32, 0, 32, 64);
      return canvas.toDataURL().split(",")[1];
    });
    const imageInput = page.locator("#avatar");
    await imageInput.setInputFiles({ name: "audit-square.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator("img").evaluate(image => image.decode());
    await dialog.getByRole("slider", { name: "Horizontal position", exact: true }).focus();
    await page.keyboard.press("End");
    await frames(page);
    assert.ok(await dialog.locator("img").evaluate(image => {
      const parent = image.parentElement.getBoundingClientRect(), rect = image.getBoundingClientRect();
      return Math.abs(parent.left - rect.left) < 1 && Math.abs(parent.right - rect.right) < 1;
    }), "An unzoomed square must cover the preview even at the slider limit");
    await dialog.getByRole("button", { name: "Use this crop", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.ok(await imageInput.evaluate(async input => {
      const bitmap = await createImageBitmap(input.files[0]);
      const canvas = document.createElement("canvas");canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");context.drawImage(bitmap, 0, 0);bitmap.close();
      const left = context.getImageData(20, 256, 1, 1).data, right = context.getImageData(490, 256, 1, 1).data;
      return left[0] > 200 && left[2] < 40 && right[2] > 200 && right[0] < 40;
    }), "Export must contain the same red/blue halves as the preview");
    // No settings form submit: the selected image is never persisted.

    for (const [name, mime] of [["audit-unavailable.bin", "application/octet-stream"], ["audit-player.mp4", "video/mp4"]]) {
      const result = await client.query("INSERT INTO project_files(project_id,name,storage_path,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [owner.projectId, name, `projects/${owner.projectId}/audit-followup/${name}`, mime, owner.id]);
      fileIds.push(result.rows[0].id);
    }
    await page.route("**/api/storage?**", denyStorage);
    page.on("download", onDownload);
    await page.goto(root + "/files");
    await page.getByRole("button", { name: "Preview audit-unavailable.bin", exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Download", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "403" }).waitFor();
    assert.equal(downloads.length, 0, "An error response must never be saved as the requested file");
    await page.keyboard.press("Escape");await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Preview audit-player.mp4", exact: true }).click();
    const video = page.locator("video");await video.waitFor();await video.focus();
    const direction = await dialog.getByRole("button", { name: "Next", exact: true }).isEnabled() ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.press(direction);
    assert.equal(await dialog.locator('[data-slot="dialog-title"]').textContent(), "audit-player.mp4", "Media keys must leave the current preview open");
    await dialog.focus();await page.keyboard.press(direction);
    await video.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");await dialog.waitFor({ state: "hidden" });
    await page.unroute("**/api/storage?**", denyStorage);

    for (const priority of ["medium", "high"]) {
      taskIds.push((await client.query("INSERT INTO tasks(project_id,created_by,title,priority) VALUES($1,$2,$3,$4) RETURNING id", [owner.projectId, owner.id, `Audit gesture ${priority}`, priority])).rows[0].id);
    }
    await page.goto(root + "/work");
    const priority = page.getByRole("button", { name: /All priorities/ }).first();
    await priority.click();const menu = page.getByRole("menu");await menu.waitFor();
    assert.equal(await menu.getAttribute("data-motion"), "default");
    await page.keyboard.press("Escape");await menu.waitFor({ state: "hidden" });
    await priority.focus();await page.keyboard.press("Enter");await menu.waitFor();
    assert.equal(await menu.evaluate(node => getComputedStyle(node).animationName), "none", "Keyboard menus must open instantly");
    await page.keyboard.press("Escape");await menu.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.locator("#new-task-due").focus();await page.keyboard.press("Enter");
    const calendar = page.locator('[data-slot="popover-content"]');await calendar.waitFor();
    assert.equal(await calendar.evaluate(node => getComputedStyle(node).animationName), "none", "Keyboard date picker must open instantly");
    await page.keyboard.press("Escape");await calendar.waitFor({ state: "hidden" });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();await dialog.waitFor({ state: "hidden" });

    const card = page.locator(`[data-card-id="${taskIds[0]}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.evaluate(node => {
      const rect = node.getBoundingClientRect();
      window.__auditCardPointer = (type, id, primary) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch", isPrimary: primary, button: 0, buttons: 1, clientX: rect.x + 35, clientY: rect.y + 25 }));
      window.__auditCardPointer("pointerdown", 41, true);
    });
    const ghost = page.locator('[data-slot="task-drag-ghost"]');await ghost.waitFor();
    await page.evaluate(() => { window.__auditCardPointer("pointerdown", 42, false);window.__auditCardPointer("pointercancel", 42, false); });
    assert.ok(await ghost.isVisible(), "A secondary pointer must not cancel the active drag");
    await page.evaluate(() => { window.__auditCardPointer("pointerup", 41, true);window.__auditCardPointer("pointerup", 42, false); });
    await ghost.waitFor({ state: "hidden" });
    await page.evaluate(() => window.__auditCardPointer("pointerdown", 43, true));await ghost.waitFor();
    await priority.focus();await page.keyboard.press("Enter");await menu.waitFor();
    await menu.getByRole("menuitem", { name: "High", exact: true }).focus();await page.keyboard.press("Enter");
    await card.waitFor({ state: "hidden" });await ghost.waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(artifacts, "audit-followup.png") });
  } finally {
    page.off("download", onDownload);
    await page.unroute("**/api/storage?**", denyStorage);
    if (taskIds.length) await client.query("DELETE FROM tasks WHERE id=ANY($1::uuid[]) AND project_id=$2", [taskIds, owner.projectId]);
    if (fileIds.length) await client.query("DELETE FROM project_files WHERE id=ANY($1::uuid[]) AND project_id=$2", [fileIds, owner.projectId]);
  }
}
