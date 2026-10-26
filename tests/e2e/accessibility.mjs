import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";

/** Actual application documents, with all WCAG A/AA rules enabled. */
export async function accessibilityCoverage({ page, context, origin, fixture, browserName, artifacts }) {
  const owner=fixture.users[0];
  const scans=[];
  async function scan(name) {
    await page.waitForLoadState("networkidle");
    // Read final colors and geometry after finite entrance animations settle.
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
    const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
    scans.push({name,violations:result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
  }
  try {
    await context.clearCookies(); await page.goto(`${origin}/auth/login`); await page.locator("#email").waitFor();
    await scan("login");
    await page.locator("#email").fill(owner.email); await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL(url=>url.pathname==="/dashboard");
    for(const theme of ["light","dark"]) {
      await page.emulateMedia({colorScheme:theme});
      for(const [name,route] of [["dashboard","/dashboard"],["board",`/projects/${owner.projectId}/work`]]) { await page.goto(origin+route); await page.getByRole("heading",{level:1}).waitFor(); await scan(`${name}-${theme}`); }
    }
    await page.emulateMedia({colorScheme:"light"});
    await page.getByRole("button",{name:"New task",exact:true}).click();
    const dialog=page.getByRole("dialog"); await dialog.waitFor(); await scan("create-task-dialog");
    for(let step=0;step<25;step++) { await page.keyboard.press("Tab"); assert.ok(await dialog.evaluate(node=>node.contains(document.activeElement)),"Focus must stay in the task dialog"); }
    await page.keyboard.press("Escape"); await dialog.waitFor({state:"hidden"});
    // The dialog hands focus back from its close callback, which can land a
    // frame after it is hidden - wait briefly, then still require it.
    const newTask=page.getByRole("button",{name:"New task",exact:true});
    await page.waitForFunction(node=>node===document.activeElement,await newTask.elementHandle(),{timeout:2000}).catch(()=>{});
    assert.ok(await newTask.evaluate(node=>node===document.activeElement),"Closing the dialog restores focus");
    for(const [name,route] of [["project-settings",`/projects/${owner.projectId}/settings`],["profile","/profile"],["billing-self-hosted",`/organizations/${owner.organizationId}/billing`]]) { await page.goto(origin+route); await page.getByRole("heading",{level:1}).waitFor(); await scan(name); }
  } finally {
    await writeFile(path.join(artifacts,`${browserName}-accessibility.json`),JSON.stringify({browser:browserName,scans,manualRequired:["NVDA and VoiceOver announcements","physical mobile keyboard and touch","Cloud Stripe checkout in isolated sandbox"],checkout:"not-tested: isolated self-hosted fixture has no Stripe"},null,2));
    await context.clearCookies(); await page.emulateMedia({colorScheme:null});
  }
  const serious=scans.flatMap(scan=>scan.violations.filter(v=>["critical","serious"].includes(v.impact)).map(v=>`${scan.name}: ${v.id} ${JSON.stringify(v.nodes.map(n=>n.target))}`));
  assert.deepEqual(serious,[],"Critical/serious accessibility violations must be fixed; no rule or element exclusions");
  return {browser:browserName,scans:scans.length,criticalOrSerious:0};
}
