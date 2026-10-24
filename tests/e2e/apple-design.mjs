import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {allowBrowserRequest} from './isolation.mjs';

const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const settled=locator=>locator.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});

export async function appleDesignCoverage({page,context,origin,fixture,client,browserName,artifacts}) {
  const owner=fixture.users[0], created=[], errors=[];
  const capture=error=>errors.push(`${new URL(page.url()).pathname}: ${error.message}`);
  page.on('pageerror',capture);
  const route=`${origin}/projects/${owner.projectId}/work`;
  const manifest=JSON.parse(await readFile(new URL('../../examples/module-manifests/release-planning.json',import.meta.url),'utf8'));
  const messages=JSON.parse(await readFile(new URL('../../messages/en.json',import.meta.url),'utf8'));
  const image=await readFile(new URL('../../public/assets/guidon-wordmark.png',import.meta.url));
  const images=[{name:'apple-first.png',mimeType:'image/png',buffer:image},{name:'apple-second.png',mimeType:'image/png',buffer:image}];
  try{
    await page.goto(origin+'/auth/login');
    await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);
    await page.locator('#password').focus();await page.keyboard.press('Tab');
    const reveal=page.getByRole('button',{name:'Show password',exact:true});
    assert.equal(await reveal.evaluate(node=>node===document.activeElement),true);
    await page.keyboard.press('Space');assert.equal(await page.locator('#password').getAttribute('type'),'text');
    assert.equal(await page.locator('#password').inputValue(),fixture.password);
    await page.getByRole('button',{name:'Hide password',exact:true}).press('Enter');
    assert.equal(await page.locator('#password').getAttribute('type'),'password');
    await page.locator('button[type="submit"]').click();await page.waitForURL(u=>u.pathname==='/dashboard');
    // Finish login navigation and its initial refresh before injecting a
    // transport failure. Otherwise Next's pending-navigation recovery can
    // reload the document while the test tries to use the transient menu.
    const initialNotifications=page.waitForResponse(response=>response.request().method()==='POST' && !!response.request().headers()['next-action']);
    await page.goto(origin+'/dashboard');await initialNotifications;
    await page.route(origin+'/dashboard',request=>request.request().method()==='POST' && request.request().headers()['next-action']?request.abort('failed'):request.continue());
    await page.getByRole('button',{name:messages.notifications.bellAria,exact:true}).click();
    await page.getByRole('alert').filter({hasText:messages.notifications.loadFailed}).waitFor();
    await page.unroute(origin+'/dashboard');
    await page.getByRole('button',{name:messages.notifications.retry,exact:true}).click();
    await page.getByRole('alert').filter({hasText:messages.notifications.loadFailed}).waitFor({state:'hidden'});await page.keyboard.press('Escape');

    await page.goto(origin+'/profile');await page.getByRole('button',{name:'Background style',exact:true}).click();
    await page.getByRole('menuitem',{name:'Solid — focus on your work',exact:true}).click();
    await frames(page);assert.equal(await page.locator('canvas').count(),0);
    await page.getByRole('button',{name:'Background style',exact:true}).click();
    await page.getByRole('menuitem',{name:'Guidon pattern',exact:true}).click();
    await page.locator('canvas').waitFor();
    await page.getByRole('button',{name:'Background style',exact:true}).click();
    await page.getByRole('menuitem',{name:'Solid — focus on your work',exact:true}).click();
    assert.equal(errors.some(error=>/418|hydrat/i.test(error)),false,'Profile must hydrate with fixture API key dates');
    await page.goto(`${origin}/projects/${owner.projectId}/settings`);
    await page.locator('#avatar').setInputFiles(images[0]);
    const crop=page.getByRole('dialog');await crop.getByRole('slider').first().fill('1.8');
    assert.equal(await crop.locator('img').evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
    for(const slider of await crop.getByRole('slider').all()){
      const before=Number(await slider.inputValue());
      await slider.press('ArrowRight');assert.ok(Number(await slider.inputValue())>before);
      await slider.press('ArrowLeft');assert.equal(Number(await slider.inputValue()),before);
    }
    await crop.getByRole('button',{name:/Cancel/i,exact:true}).click();await crop.waitFor({state:'hidden'});

    const day=new Date().toISOString().slice(0,10);
    const inserted=await client.query("INSERT INTO public.tasks(project_id,created_by,title,status,due_date) SELECT $1,$2,'Apple '||$3::text||' '||n,CASE WHEN n=6 THEN 'backlog' ELSE 'todo' END,$4::date FROM generate_series(1,6) n RETURNING id,title,status,sort_order",[owner.projectId,owner.id,browserName,day]);
    created.push(...inserted.rows.map(row=>row.id));
    await page.goto(route);await page.getByRole('list',{name:'Task board',exact:true}).waitFor();
    const task=inserted.rows[0];const card=page.getByRole('list',{name:'Task board',exact:true}).locator(`[data-card-id="${task.id}"]`);
    const baseline=(await client.query('SELECT status,sort_order,title FROM public.tasks WHERE id=$1',[task.id])).rows[0];
    const actions=[];const watch=request=>{if(request.headers()['next-action'])actions.push(request.url());};page.on('request',watch);
    const begin=async(status='backlog')=>{
      await card.hover();
      await card.evaluate(node=>node.addEventListener('pointerdown',event=>{node.dataset.auditPointer=String(event.pointerId);},{once:true}));
      const bounds=await card.boundingBox();await page.mouse.move(bounds.x+35,bounds.y+18);await page.mouse.down();
      await page.mouse.move(bounds.x+55,bounds.y+18);await frames(page);
      const target=await page.locator(`[data-column-status="${status}"]`).boundingBox();
      await page.mouse.move(target.x+80,target.y+90);await frames(page);
      return Number(await card.getAttribute('data-audit-pointer'));
    };
    await page.emulateMedia({reducedMotion:'reduce'});await frames(page);
    const reducedPointer=await begin();
    const ghost=page.locator('[data-slot="task-drag-ghost"]');await ghost.waitFor();
    assert.equal(await ghost.getAttribute('aria-hidden'),'true');
    assert.equal(await ghost.evaluate(node=>node.inert),true);
    const scale=await ghost.evaluate(node=>new DOMMatrixReadOnly(getComputedStyle(node).transform).a);
    assert.ok(Math.abs(scale-1)<0.001,'Reduced motion keeps the drag ghost at its real scale');
    await card.dispatchEvent('pointercancel',{pointerId:reducedPointer,pointerType:'mouse',bubbles:true});await page.mouse.up();await frames(page);
    await page.emulateMedia({reducedMotion:'no-preference'});await frames(page);
    for(const cancellation of ['pointercancel','lostcapture','escape']){
      const pointerId=await begin();const before=actions.length;
      if(cancellation==='escape')await page.keyboard.press('Escape');
      else if(cancellation==='lostcapture')await card.evaluate((node,id)=>node.releasePointerCapture(id),pointerId);
      else await card.dispatchEvent('pointercancel',{pointerId,pointerType:'mouse',bubbles:true});
      await page.mouse.up();await frames(page);
      assert.equal(actions.length,before,`${cancellation} must not send a move action`);
      assert.deepEqual((await client.query('SELECT status,sort_order,title FROM public.tasks WHERE id=$1',[task.id])).rows[0],baseline);
    }
    await begin();await page.mouse.up();
    await page.getByRole('status').filter({hasText:task.title}).waitFor();
    assert.equal((await client.query('SELECT status FROM public.tasks WHERE id=$1',[task.id])).rows[0].status,'backlog');
    page.off('request',watch);
    const order=await page.locator('[data-column-status="backlog"] [data-card-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.cardId));
    const index=order.indexOf(task.id), position=index>0?index:index+2;
    await card.focus();await card.press(index>0?'Alt+ArrowUp':'Alt+ArrowDown');
    await page.getByRole('status').filter({hasText:new RegExp(`${task.title}.*position ${position}`)}).waitFor();await frames(page);
    assert.equal(await card.evaluate(node=>node===document.activeElement),true,'Keyboard reorder retains focus');

    // A rejected optimistic move keeps the prior row and exposes a live error.
    await client.query('REVOKE UPDATE ON public.tasks FROM authenticated');
    try{
      await begin('todo');await page.mouse.up();
      await page.locator('[data-slot="task-move-status"]').filter({hasText:/./}).waitFor();
      assert.equal((await client.query('SELECT status FROM public.tasks WHERE id=$1',[task.id])).rows[0].status,'backlog');
      assert.equal(await card.evaluate(node=>node.closest('[data-column-status]').dataset.columnStatus),'backlog');
    }finally{await client.query('GRANT UPDATE ON public.tasks TO authenticated');}

    await card.click();await page.locator('#task-title').fill(task.title+' unsaved');
    await page.keyboard.press('Escape');
    const confirm=page.getByRole('dialog',{name:'Confirm action',exact:true});await confirm.waitFor();
    await confirm.getByRole('button',{name:'Cancel',exact:true}).click();
    await confirm.waitFor({state:'hidden'});
    assert.equal(await page.locator('#task-title').inputValue(),task.title+' unsaved');
    await page.keyboard.press('Escape');await confirm.getByRole('button',{name:'Discard changes',exact:true}).click();
    await page.locator('#task-title').waitFor({state:'hidden'});
    assert.equal((await client.query('SELECT title FROM public.tasks WHERE id=$1',[task.id])).rows[0].title,task.title);

    await page.getByRole('button',{name:'New task',exact:true}).click();
    await page.locator('#new-task-title').fill('Unsaved new task');await page.locator('#new-task-description').fill('Keep this description');
    await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(images);
    await page.keyboard.press('Escape');await confirm.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.locator('#new-task-description').inputValue(),'Keep this description');
    await page.getByRole('dialog').getByText('apple-first.png',{exact:true}).waitFor();
    await page.getByRole('dialog').getByText('apple-second.png',{exact:true}).waitFor();
    await page.setViewportSize({width:320,height:480});
    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    const formDialog=page.getByRole('dialog').filter({has:page.locator('#new-task-title')});
    await frames(page);await settled(formDialog);
    const bounds=await formDialog.boundingBox();assert.ok(bounds.y>=-1 && bounds.y+bounds.height<=481,`Dialog must fit 320×480 at 200% text: ${JSON.stringify(bounds)}`);
    await formDialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await confirm.getByRole('button',{name:'Discard changes',exact:true}).click();
    await page.evaluate(()=>{document.documentElement.style.fontSize='';});await page.setViewportSize({width:1440,height:1000});

    await page.getByRole('button',{name:'New task',exact:true}).click();
    const imageTask=`Apple images ${browserName}`;await page.locator('#new-task-title').fill(imageTask);
    await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(images);
    await page.getByRole('button',{name:'Create task',exact:true}).click();
    await page.locator('#new-task-title').waitFor({state:'hidden'});
    const stored=(await client.query('SELECT id FROM public.tasks WHERE project_id=$1 AND title=$2',[owner.projectId,imageTask])).rows[0];created.push(stored.id);
    const storedImages=(await client.query('SELECT name FROM public.task_attachments WHERE task_id=$1 ORDER BY name',[stored.id])).rows;
    assert.equal(storedImages.length,2);
    const [firstImage,secondImage]=storedImages.map(image=>image.name);
    await page.locator(`[data-card-id="${stored.id}"]`).click();
    const openImageName=messages.work.openImageAria.replace('{name}',firstImage);
    await page.getByRole('button',{name:openImageName,exact:true}).click();
    const lightbox=page.getByRole('dialog',{name:firstImage,exact:true});await lightbox.waitFor();
    const area=lightbox.locator('img').locator('..');
    const start=async()=>{const box=await area.boundingBox();await area.evaluate(node=>node.addEventListener('pointerdown',event=>{node.dataset.auditPointer=String(event.pointerId);},{once:true}));await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();return {x:box.x+box.width/2,y:box.y+box.height/2};};
    let point=await start();await page.mouse.move(point.x+25,point.y+90);await page.mouse.up();
    assert.equal(await lightbox.count(),1,'Vertical/diagonal gesture must not switch images');
    point=await start();await page.mouse.move(point.x-150,point.y);await frames(page);
    assert.ok(Math.abs(await lightbox.locator('img').evaluate(node=>new DOMMatrixReadOnly(getComputedStyle(node).transform).m41))>=140,'Image follows pointer before release');
    await area.dispatchEvent('pointercancel',{pointerId:Number(await area.getAttribute('data-audit-pointer')),pointerType:'mouse',bubbles:true});await page.mouse.up();
    await page.waitForFunction(()=>{const image=document.querySelector('[role="dialog"] img');return image && Math.abs(new DOMMatrixReadOnly(getComputedStyle(image).transform).m41)<1;});
    assert.equal(await lightbox.count(),1,'Cancelled image drag does not switch');
    point=await start();await page.mouse.move(point.x-180,point.y);await page.mouse.up();
    await page.getByRole('dialog',{name:secondImage,exact:true}).waitFor();
    await page.keyboard.press('Escape');await page.locator('#task-title').waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();
    await confirm.getByRole('button',{name:'Cancel',exact:true}).click();await confirm.waitFor({state:'hidden'});
    assert.equal((await client.query('SELECT 1 FROM public.tasks WHERE id=$1',[stored.id])).rowCount,1);
    await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();
    await confirm.getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#task-title').waitFor({state:'hidden'});
    assert.equal((await client.query('SELECT 1 FROM public.tasks WHERE id=$1',[stored.id])).rowCount,0);

    await page.goto(`${origin}/projects/${owner.projectId}/context`);
    await page.getByRole('tab',{name:/Decisions/}).focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab',{name:/Relations/}).getAttribute('aria-selected'),'true');
    assert.equal(await page.getByRole('tabpanel').count(),1);
    const sidebar=page.locator('[data-sidebar="sidebar"]');
    const workGroup=sidebar.getByRole('button',{name:'Work',exact:true});
    await workGroup.click();assert.equal(await sidebar.getByRole('link',{name:'Task Board',exact:true}).isVisible(),false);
    await workGroup.click();await sidebar.getByRole('link',{name:'Task Board',exact:true}).waitFor();

    await page.goto(`${origin}/projects/${owner.projectId}/calendar`);
    await page.getByLabel('View',{exact:true}).selectOption('month');
    await page.getByRole('button',{name:/Show all tasks for/}).click();
    const dayDialog=page.getByRole('dialog',{name:/Tasks for/});
    for(const task of inserted.rows)await dayDialog.getByRole('button',{name:task.title,exact:true}).waitFor();
    await page.keyboard.press('Escape');await page.setViewportSize({width:375,height:812});
    await page.getByLabel('View',{exact:true}).selectOption('auto');
    for(const task of inserted.rows)await page.getByRole('region',{name:'Agenda',exact:true}).getByRole('button',{name:task.title,exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,`${browserName}-apple-calendar.png`)});

    await client.query('INSERT INTO public.project_module_packages(project_id,module_id,manifest) VALUES($1,$2,$3::jsonb)',[owner.projectId,manifest.id,JSON.stringify(manifest)]);
    for(const suffix of ['/my-modules',`/projects/${owner.projectId}/modules`,`/projects/${owner.projectId}/modules/${manifest.id}`]){
      await page.goto(origin+suffix);await page.getByRole('heading',{level:1}).waitFor();
      assert.equal(await page.locator('main').count(),1,`Single main landmark: ${suffix}`);
    }

    await page.goto(route);
    const ai=page.getByRole('button',{name:'Guidon AI Assistant',exact:true});await ai.press('Enter');
    const chat=page.getByRole('dialog');await settled(chat);
    const chatBounds=await chat.boundingBox();assert.ok(chatBounds.x>=-1 && chatBounds.width<=376);
    const input=chat.locator('textarea');await input.fill('Keep my composed text');
    let sent=0;
    await page.route('**/api/ai/chat',route=>{sent++;return route.fulfill({json:{text:'Apple test reply'}});});
    await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true});await frames(page);
    assert.equal(sent,0);assert.equal(await input.inputValue(),'Keep my composed text');
    await input.press('Shift+Enter');assert.ok((await input.inputValue()).includes('\n'));
    await chat.getByRole('button',{name:'Send message',exact:true}).click();
    await chat.getByRole('log').getByText('Apple test reply',{exact:true}).waitFor();
    assert.equal(sent,1);await page.unroute('**/api/ai/chat');
    await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});

    await page.getByRole('button',{name:'Search...',exact:true}).click();
    const search=page.getByRole('combobox');let attempts=0;
    await page.route('**/api/v1/search?**',route=>{attempts++;return attempts===1?route.fulfill({status:500,json:{error:'fixture failure'}}):route.fulfill({json:{results:[]}});});
    await search.fill('fixture');await page.getByRole('alert').filter({hasText:'Search could not be completed.'}).waitFor();
    await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('No results found.',{exact:true}).waitFor();
    await page.unroute('**/api/v1/search?**');await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Search...',exact:true}).click();
    let releaseSlow, releaseFast, sawSlow, sawFast;
    const slowGate=new Promise(resolve=>{releaseSlow=resolve;}), fastGate=new Promise(resolve=>{releaseFast=resolve;});
    const slowSeen=new Promise(resolve=>{sawSlow=resolve;}), fastSeen=new Promise(resolve=>{sawFast=resolve;});
    await page.route('**/api/v1/search?**',async request=>{
      const slow=new URL(request.request().url()).searchParams.get('q')==='slow-first';
      if(slow){sawSlow();await slowGate;}else{sawFast();await fastGate;}
      try{await request.fulfill({json:{results:[{type:'project',id:owner.projectId,title:slow?'STALE RESULT':'LATEST RESULT',metadata:{}}]}});}catch(error){if(!slow || !request.request().failure())throw error;}
    });
    try{
      await page.getByRole('combobox').fill('slow-first');await slowSeen;
      await page.getByRole('combobox').fill('fast-second');await fastSeen;await frames(page);
      assert.equal(await page.getByRole('status').filter({hasText:'Searching…'}).isVisible(),true,'Aborted old request must not clear new loading state');
      releaseFast();await page.getByText('LATEST RESULT',{exact:true}).waitFor();releaseSlow();await frames(page);
      assert.equal(await page.getByText('STALE RESULT',{exact:true}).count(),0);
      await page.getByText('LATEST RESULT',{exact:true}).waitFor();
    }finally{releaseSlow();releaseFast();await page.unroute('**/api/v1/search?**');}
    await page.keyboard.press('Escape');
    if(browserName==='chromium'){
      const touch=await context.browser().newContext({ignoreHTTPSErrors:true,hasTouch:true,locale:'en-US',viewport:{width:375,height:812}});
      try{
        await touch.addCookies(await context.cookies());await touch.route('**/*',route=>allowBrowserRequest(route.request().url(),origin)?route.continue():route.abort());
        const phone=await touch.newPage();await phone.goto(route);
        assert.equal(await phone.evaluate(()=>matchMedia('(pointer: coarse)').matches),true);
        for(const name of [messages.commandPalette.triggerLabel,messages.notifications.bellAria]){
          const box=await phone.getByRole('button',{name,exact:true}).boundingBox();assert.ok(box.height>=44 && box.width>=44,`${name} touch bounds`);
        }
        await phone.emulateMedia({contrast:'more',reducedMotion:'reduce'});
        await phone.getByRole('button',{name:messages.commandPalette.triggerLabel,exact:true}).click();
        assert.equal(await phone.getByRole('dialog').evaluate(node=>getComputedStyle(node).backdropFilter),'none');
        assert.equal(await phone.locator('[data-slot="dialog-overlay"]').evaluate(node=>getComputedStyle(node).backdropFilter),'none');
        await phone.screenshot({path:path.join(artifacts,'apple-touch-contrast.png')});
      }finally{await touch.close();}
    }
    assert.equal(errors.length,0,errors.join('\n'));
  }finally{
    page.off('pageerror',capture);
    await page.unroute('**/api/ai/chat');await page.unroute('**/api/v1/search?**');
    await client.query('DELETE FROM public.project_module_packages WHERE project_id=$1 AND module_id=$2',[owner.projectId,manifest.id]);
    if(created.length)await client.query('DELETE FROM public.tasks WHERE project_id=$1 AND id=ANY($2::uuid[])',[owner.projectId,created]);
    await page.setViewportSize({width:1440,height:1000});
  }
  await page.goto(origin+'/auth/logout');await page.waitForURL(u=>u.pathname==='/');
}
