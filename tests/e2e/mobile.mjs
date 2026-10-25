import assert from "node:assert/strict";
import path from "node:path";
import {readFile,writeFile} from "node:fs/promises";

const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const settled=locator=>locator.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
async function reachable(locator){
  await locator.scrollIntoViewIfNeeded();
  const r=await locator.evaluate(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,vw:innerWidth,vh:innerHeight,hit:node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
  assert.ok(r.x>=-1 && r.y>=-1 && r.x+r.w<=r.vw+1 && r.y+r.h<=r.vh+1 && r.hit,`Control must be visible and unobstructed: ${JSON.stringify(r)}`);
}

export async function mobileCoverage({page,context,origin,fixture,client,browserName,artifacts}){
 const owner=fixture.users[0],created=[],metrics=[],root=`${origin}/projects/${owner.projectId}`;
 const image=await readFile(new URL('../../public/assets/guidon-wordmark.png',import.meta.url));
 try{
  await page.goto(origin+'/auth/login');await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);await page.locator('button[type="submit"]').tap();await page.waitForURL(url=>url.pathname==='/dashboard');
  for(const width of [375,390,430]){
   await page.setViewportSize({width,height:812});await page.goto(root+'/work');
   const toggle=page.getByRole('button',{name:'Toggle sidebar (Ctrl+B)',exact:true}),drawer=page.locator('[data-mobile="true"]');
   await reachable(toggle);await toggle.tap();await drawer.waitFor();await settled(drawer);
   const close=drawer.getByRole('button',{name:'Close',exact:true});await reachable(close);await close.tap();await drawer.waitFor({state:'hidden'});
   await toggle.tap();await drawer.waitFor();await settled(drawer);await drawer.getByRole('link',{name:'Calendar',exact:true}).tap();
   await page.waitForURL(url=>url.pathname===`/projects/${owner.projectId}/calendar`);await drawer.waitFor({state:'hidden'});
   await page.getByRole('heading',{level:1}).waitFor();await page.getByRole('button',{name:'Toggle sidebar (Ctrl+B)',exact:true}).tap();await drawer.waitFor();await settled(drawer);
   await drawer.getByRole('link',{name:'Task Board',exact:true}).tap();await page.waitForURL(url=>url.pathname.endsWith('/work'));await drawer.waitFor({state:'hidden'});
   const board=page.getByRole('list',{name:'Task board',exact:true});await board.waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await board.evaluate(node=>node.scrollWidth>node.clientWidth));
   const heading=await page.getByRole('heading',{name:'Task board',exact:true}).boundingBox();assert.ok(heading.height<50,'The title must not be squeezed between toolbar buttons');
   const add=page.getByRole('button',{name:'New task',exact:true});await reachable(add);await add.tap();
   const dialog=page.getByRole('dialog').filter({has:page.locator('#new-task-title')});await dialog.waitFor();await settled(dialog);
   const title=`Mobile ${browserName} ${width}`;await page.locator('#new-task-title').fill(title);await page.locator('#new-task-description').fill('Created through the mobile form');
   for(const selector of ['#new-task-title','#new-task-description'])assert.ok(await page.locator(selector).evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
   await dialog.locator('input[type="file"]').setInputFiles({name:`mobile-${width}.png`,mimeType:'image/png',buffer:image});
   const submit=dialog.getByRole('button',{name:'Create task',exact:true});await reachable(submit);await submit.tap();await dialog.waitFor({state:'hidden'});
   const task=(await client.query('SELECT id FROM tasks WHERE project_id=$1 AND title=$2',[owner.projectId,title])).rows[0];assert.ok(task);created.push(task.id);
   assert.equal((await client.query('SELECT count(*)::int AS n FROM task_attachments WHERE task_id=$1',[task.id])).rows[0].n,1);
   await page.reload();
   // Drag ghosts are deliberately duplicate, inert artwork outside the board.
   const card=board.locator(`[data-card-id="${task.id}"]`);await card.scrollIntoViewIfNeeded();await card.locator('[data-task-open]').tap();await page.locator('#task-title').waitFor();
   const details=page.getByRole('dialog').filter({has:page.locator('#task-title')});await settled(details);
   await reachable(page.locator('#task-priority'));await page.locator('#task-priority').tap();
   const menu=page.getByRole('menu');await menu.waitFor();await settled(menu);const high=menu.getByRole('menuitem',{name:'High',exact:true});await reachable(high);await high.tap();await menu.waitFor({state:'hidden'});
   const save=details.getByRole('button',{name:'Save changes',exact:true});await reachable(save);await save.tap();await details.waitFor({state:'hidden'});
   await page.reload();assert.equal((await client.query('SELECT priority FROM tasks WHERE id=$1',[task.id])).rows[0].priority,'high');
   await card.scrollIntoViewIfNeeded();await card.getByRole('button',{name:`Move task "${title}"`,exact:true}).tap();await page.getByRole('menuitem',{name:'Move to Review',exact:true}).tap();await page.getByRole('status').filter({hasText:title}).waitFor();
   await page.reload();assert.equal((await client.query('SELECT status FROM tasks WHERE id=$1',[task.id])).rows[0].status,'review');
   metrics.push({width,height:812,upload:true,prioritySave:true,touchMenuMove:true});await page.screenshot({path:path.join(artifacts,`${browserName}-mobile-${width}.png`),fullPage:true});
  }
  if(browserName==='chromium'){
   await page.setViewportSize({width:390,height:812});const title='Mobile native touch gesture';
   const task=(await client.query("INSERT INTO tasks(project_id,created_by,title,status) VALUES($1,$2,$3,'backlog') RETURNING id",[owner.projectId,owner.id,title])).rows[0];created.push(task.id);
   await page.goto(root+'/work');const board=page.getByRole('list',{name:'Task board',exact:true}),card=board.locator(`[data-card-id="${task.id}"]`);await card.scrollIntoViewIfNeeded();
   const cdp=await context.newCDPSession(page),touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
   const start=async()=>{await board.evaluate(node=>{node.scrollLeft=0;});await frames(page);const b=await card.boundingBox();return {x:b.x+b.width/2,y:b.y+25};};
   try{
    const p=await start();await touch('touchStart',[p]);for(const x of [p.x-30,p.x-65,25])await touch('touchMove',[{x,y:p.y}]);await touch('touchEnd');
    await page.waitForFunction(()=>document.querySelector('[role="list"][aria-label="Task board"]').scrollLeft>0);assert.equal((await client.query('SELECT status FROM tasks WHERE id=$1',[task.id])).rows[0].status,'backlog');
    const cancel=await start();await touch('touchStart',[cancel]);await page.locator('[data-slot="task-drag-ghost"]').waitFor();await touch('touchCancel');await page.locator('[data-slot="task-drag-ghost"]').waitFor({state:'hidden'});assert.equal((await client.query('SELECT status FROM tasks WHERE id=$1',[task.id])).rows[0].status,'backlog');
    const p2=await start();await touch('touchStart',[p2]);await page.locator('[data-slot="task-drag-ghost"]').waitFor();const target=await page.locator('[data-column-status="todo"]').boundingBox();assert.ok(target.x<370);await touch('touchMove',[{x:Math.min(370,target.x+30),y:p2.y}]);await frames(page);await touch('touchEnd');
    await page.getByRole('status').filter({hasText:title}).waitFor();assert.equal((await client.query('SELECT status FROM tasks WHERE id=$1',[task.id])).rows[0].status,'todo');metrics.push({width:390,nativeChromiumTouch:{swipe:true,cancel:true,holdDrag:true}});
   }finally{await touch('touchCancel').catch(()=>{});await cdp.detach();}
  }
  await page.setViewportSize({width:812,height:375});await page.goto(root+'/work');await page.getByRole('button',{name:'New task',exact:true}).tap();
  const landscape=page.getByRole('dialog').filter({has:page.locator('#new-task-title')});await settled(landscape);const cancel=landscape.getByRole('button',{name:'Cancel',exact:true});await reachable(cancel);await cancel.tap();await landscape.waitFor({state:'hidden'});metrics.push({width:812,height:375,landscapeActionsReachable:true});
  await writeFile(path.join(artifacts,`${browserName}-mobile.json`),JSON.stringify({browser:browserName,emulation:true,metrics,manualRequired:['physical keyboard/safe-area behavior','iOS touch drag','real Android hardware']},null,2));
 }finally{if(created.length)await client.query('DELETE FROM tasks WHERE project_id=$1 AND id=ANY($2::uuid[])',[owner.projectId,created]);}
}
