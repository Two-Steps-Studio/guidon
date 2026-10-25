import assert from "node:assert/strict";
import path from "node:path";

async function assertBoardBounds(board){
  const dimensions=await board.evaluate(node=>{
    const bounds=node.getBoundingClientRect();
    const columns=Array.from(node.querySelectorAll("[data-column-status]")).map(column=>column.getBoundingClientRect());
    return {gap:bounds.bottom-Math.max(...columns.map(column=>column.bottom)),allowance:parseFloat(getComputedStyle(node).paddingBottom)+node.offsetHeight-node.clientHeight+3,bottom:bounds.bottom,viewport:window.innerHeight,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight};
  });
  assert.ok(dimensions.gap<=dimensions.allowance,`Board leaves ${dimensions.gap}px below its longest column (allowed ${dimensions.allowance}px)`);
  assert.ok(dimensions.scrollHeight<=dimensions.clientHeight+1,`Board has phantom vertical overflow: ${dimensions.scrollHeight}px content in ${dimensions.clientHeight}px viewport`);
  return dimensions;
}

export async function boardLayoutCoverage({page,origin,fixture,client,browserName,artifacts}){
  const owner=fixture.users[0];
  const created=[];
  const previousPins=(await client.query("SELECT pinned_task_ids FROM public.profiles WHERE id=$1",[owner.id])).rows[0].pinned_task_ids;
  try{
    const pinned=(await client.query("SELECT id,title FROM public.tasks WHERE project_id=$1 ORDER BY created_at LIMIT 1",[owner.projectId])).rows[0];
    await client.query("UPDATE public.profiles SET pinned_task_ids=$2 WHERE id=$1",[owner.id,[pinned.id]]);
    await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(owner.email);await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/dashboard");
    await page.getByRole("heading",{level:1}).waitFor();
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    const board=page.getByRole("list",{name:"Task board",exact:true});await board.waitFor();
    const sidebar=page.locator('[data-sidebar="sidebar"]');
    assert.equal(await sidebar.getByRole("link",{name:pinned.title,exact:true}).count(),0,"Pinned tasks must not reappear in the sidebar");
    const targets=["/dashboard","/my-tasks","/projects",`/projects/${owner.projectId}/work`,"/profile"];
    const positions=()=>sidebar.locator("a").evaluateAll((links,targets)=>Object.fromEntries(links.filter(link=>targets.includes(link.getAttribute("href"))).map(link=>{const rect=link.getBoundingClientRect();return [link.getAttribute("href"),rect.top+rect.height/2];})),targets);
    const expanded=await positions();assert.equal(Object.keys(expanded).length,targets.length);
    const toggle=page.getByRole("button",{name:"Toggle sidebar (Ctrl+B)",exact:true});
    await toggle.click();
    const collapsed=page.locator('[data-collapsible="icon"]');await collapsed.waitFor();
    await collapsed.evaluate(async node=>{node.getBoundingClientRect();await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
    const compact=await positions();
    for(const target of targets)assert.ok(Math.abs(expanded[target]-compact[target])<=1.5,`Sidebar row ${target} jumps vertically on collapse: ${expanded[target]} -> ${compact[target]}`);
    for(const [name,item] of [["Switch project",owner.projectName],["Theme","System"],["Language","English"]]){
      await sidebar.getByRole("button",{name:`${name}: ${item}`,exact:true}).click();
      await page.getByRole("menuitem",{name:item,exact:true}).waitFor();
      await page.keyboard.press("Escape");
    }
    await page.screenshot({path:path.join(artifacts,`${browserName}-collapsed-sidebar.png`)});
    await toggle.click();await collapsed.waitFor({state:"hidden"});
    await sidebar.evaluate(async node=>{node.getBoundingClientRect();await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
    const restored=await positions();
    for(const target of targets)assert.ok(Math.abs(expanded[target]-restored[target])<=1.5,`Sidebar row ${target} shifts after expansion`);
    assert.deepEqual((await client.query("SELECT pinned_task_ids FROM public.profiles WHERE id=$1",[owner.id])).rows[0].pinned_task_ids,[pinned.id],"Removing the sidebar list must preserve saved pins");
    const short=await assertBoardBounds(board);
    assert.ok(short.bottom<=short.viewport+1,"Desktop board must remain inside the available viewport");
    await board.evaluate(node=>{node.scrollLeft=node.scrollWidth;});
    assert.ok(await board.evaluate(node=>node.scrollLeft>0),"Horizontal column scrolling must remain available");
    await board.evaluate(node=>{node.scrollLeft=0;});
    await page.screenshot({path:path.join(artifacts,`${browserName}-short-board.png`)});
    const status=(await client.query("SELECT status FROM public.tasks WHERE project_id=$1 ORDER BY created_at LIMIT 1",[owner.projectId])).rows[0].status;
    const inserted=await client.query("INSERT INTO public.tasks(project_id,created_by,title,status) SELECT $1,$2,'Layout '||$3::text||' task '||n,$4 FROM generate_series(1,40) n RETURNING id",[owner.projectId,owner.id,browserName,status]);
    created.push(...inserted.rows.map(row=>row.id));
    await page.reload();await board.waitFor();
    const tall=await assertBoardBounds(board);
    assert.ok(tall.bottom<=tall.viewport+1,"Long columns must remain capped to the desktop viewport");
    const column=board.locator(`[data-column-status="${status}"] [data-column-scroll]`);
    assert.ok(await column.evaluate(node=>node.scrollHeight>node.clientHeight+1),"Long task lists must retain their own vertical scroll");
    await column.evaluate(node=>{node.scrollTop=node.scrollHeight;});
    assert.ok(await column.evaluate(node=>node.scrollTop>0));
    const end=await column.evaluate(node=>{
      const cards=node.querySelectorAll('[data-card-id]');
      return {gap:node.getBoundingClientRect().bottom-cards[cards.length-1].getBoundingClientRect().bottom,allowance:parseFloat(getComputedStyle(node).paddingBottom)+parseFloat(getComputedStyle(node).rowGap)+node.offsetWidth-node.clientWidth+3};
    });
    assert.ok(end.gap>=-1&&end.gap<=end.allowance,`Column scroll must stop at its last card: ${JSON.stringify(end)}`);
    await page.setViewportSize({width:375,height:812});
    await assertBoardBounds(board);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"Phone page must not overflow horizontally");
    await page.screenshot({path:path.join(artifacts,`${browserName}-mobile-board.png`)});
  }finally{
    if(created.length)await client.query("DELETE FROM public.tasks WHERE id=ANY($1::uuid[]) AND project_id=$2",[created,owner.projectId]);
    await client.query("UPDATE public.profiles SET pinned_task_ids=$2 WHERE id=$1",[owner.id,previousPins]);
    await page.setViewportSize({width:1440,height:1000});
  }
  await page.goto(`${origin}/auth/logout`);await page.waitForURL(url=>url.pathname==="/");
}
