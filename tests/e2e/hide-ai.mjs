import assert from "node:assert/strict";
import path from "node:path";
import { allowBrowserRequest } from "./isolation.mjs";

// A person who doesn't want AI turns it off in their profile: the board
// shows no AI calls to action, for them only, and turning it back on
// restores them. Connected agents are untouched (it hides, not revokes).
export async function hideAiCoverage({context,origin,fixture,client,browserName,artifacts}) {
  const owner=fixture.users[0];
  const isolated=await context.browser().newContext({ignoreHTTPSErrors:true,locale:"en-US",viewport:{width:1440,height:1000}});
  await isolated.route("**/*",route=>allowBrowserRequest(route.request().url(),origin)?route.continue():route.abort());
  const page=await isolated.newPage();page.setDefaultTimeout(15000);
  const board=`${origin}/projects/${owner.projectId}/work`;
  const connect=()=>page.getByRole("button",{name:"Connect your agent",exact:true});
  try {
    await page.goto(`${origin}/auth/login`);await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(owner.email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/dashboard");
    await page.goto(board);await connect().first().waitFor();
    await page.goto(`${origin}/profile`);
    const toggle=page.getByRole("switch",{name:"Show AI features"});
    assert.equal(await toggle.isChecked(),true);
    await toggle.uncheck();
    await expectEventually(async()=>(await client.query("SELECT hide_ai FROM profiles WHERE id=$1",[owner.id])).rows[0].hide_ai===true,"hide_ai saved");
    await page.goto(board);await page.getByRole("heading",{name:"Task board",exact:true}).waitFor();
    assert.equal(await connect().count(),0,"No 'Connect your agent' with AI hidden");
    assert.equal(await page.getByRole("button",{name:/Starter tasks for your agent/}).count(),0);
    await page.goto(`${origin}/profile`);await page.getByRole("switch",{name:"Show AI features"}).check();
    await expectEventually(async()=>(await client.query("SELECT hide_ai FROM profiles WHERE id=$1",[owner.id])).rows[0].hide_ai===false,"hide_ai cleared");
    await page.goto(board);await connect().first().waitFor();
  } catch(error) {
    await page.screenshot({path:path.join(artifacts,`${browserName}-hide-ai-failed.png`),fullPage:true});
    throw error;
  } finally {
    await isolated.close();
    await client.query("UPDATE profiles SET hide_ai=false WHERE id=$1",[owner.id]);
  }
}

async function expectEventually(check,label,timeoutMs=10000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.fail(`Timed out waiting: ${label}`);
}
