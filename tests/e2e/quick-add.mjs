import assert from "node:assert/strict";
import path from "node:path";
import { allowBrowserRequest } from "./isolation.mjs";

// My tasks on a phone: the floating button, a title, Enter - a task assigned
// to you in the project's To do, in three interactions, without horizontal
// scroll; a retry after a lost response still makes one task.
export async function quickAddCoverage({context,origin,fixture,client,browserName,artifacts}) {
  const owner=fixture.users[0], title=`Quick add ${browserName}`;
  const phone=await context.browser().newContext({ignoreHTTPSErrors:true,locale:"en-US",viewport:{width:375,height:812},hasTouch:true});
  await phone.route("**/*",route=>allowBrowserRequest(route.request().url(),origin)?route.continue():route.abort());
  const page=await phone.newPage();page.setDefaultTimeout(15000);
  try {
    await page.goto(`${origin}/auth/login`);await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(owner.email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/dashboard");
    await page.goto(`${origin}/my-tasks`);
    const fab=page.getByRole("button",{name:"Quick add",exact:true}).last();
    const box=await fab.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,"The button is at least 44x44");
    await fab.click();
    await page.locator("#quick-add-title").fill(title);
    await page.locator("#quick-add-title").press("Enter");
    await page.locator("#quick-add-title").waitFor({state:"hidden"});
    await page.getByText(title,{exact:true}).first().waitFor();
    const row=(await client.query("SELECT project_id,assignee_id,status,created_by FROM tasks WHERE title=$1",[title])).rows;
    assert.equal(row.length,1);assert.equal(row[0].assignee_id,owner.id);assert.equal(row[0].created_by,owner.id);assert.equal(row[0].status,"todo");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"No horizontal scroll at 375 px");
    // The answer is lost after the insert committed; the retry returns the same task.
    await fab.click();await page.locator("#quick-add-title").fill(`${title} once`);
    let lost=0;
    await page.route(`${origin}/my-tasks**`,async route=>{
      if(route.request().method()!=="POST"||!route.request().headers()["next-action"]||lost)return route.fallback();
      lost++;await route.fetch();await route.abort("failed");
    });
    await page.getByRole("button",{name:"Add task",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"Couldn't reach Guidon"}).waitFor();
    await page.unroute(`${origin}/my-tasks**`);
    await page.getByRole("button",{name:"Add task",exact:true}).click();
    await page.locator("#quick-add-title").waitFor({state:"hidden"});
    assert.equal((await client.query("SELECT count(*)::int AS n FROM tasks WHERE title=$1",[`${title} once`])).rows[0].n,1);
  } catch(error) {
    await page.screenshot({path:path.join(artifacts,`${browserName}-quick-add-failed.png`),fullPage:true});
    throw error;
  } finally {
    await phone.close();
    await client.query("DELETE FROM tasks WHERE created_by=$1 AND title LIKE $2",[owner.id,`${title}%`]);
  }
}
