// Read-only UI evidence collection against the runner's disposable app.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function designAudit({page,context,origin,fixture,browserName,artifacts}) {
  const owner=fixture.users[0], rows=[], entryPage=page;
  const publicRoutes=['/','/about','/developers','/plugins','/contact','/legal/terms','/legal/privacy','/legal/eula','/auth/login','/auth/signup','/auth/forgot-password'];
  const privateRoutes=['/dashboard','/my-tasks','/projects','/organizations','/profile','/my-modules','/marketplace','/admin','/admin/users','/admin/organizations','/admin/logs','/admin/integrations','/admin/feedback','/admin/promo-codes',`/organizations/${owner.organizationId}`, ...['settings','members','billing','ai-accounts'].map(s=>`/organizations/${owner.organizationId}/${s}`),`/projects/${owner.projectId}`,...['work','tasks','calendar','knowledge','technology','references','files','settings','modules','decisions','roadmap','context','memory','members','activity'].map(s=>`/projects/${owner.projectId}/${s}`)];
  const inspect=async(route,mode)=>{
    // Separate documents prevent a deferred redirect on a legacy route from
    // interrupting the next observation. Cookies remain scoped to this fixture.
    if(page!==entryPage)await page.close();page=await context.newPage();
    await page.setViewportSize(mode.startsWith('phone')?{width:375,height:812}:{width:1440,height:1000});
    const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);
    try{
      const response=await page.goto(origin+route);await page.locator('body').waitFor();
      if(route.endsWith('/tasks'))await page.waitForURL(u=>u.pathname===route.replace(/\/tasks$/,'/work'));
      const heading=page.locator('h1,h2,[role="heading"]').first();
      await heading.waitFor({timeout:1500}).catch(()=>{});
      await page.evaluate(()=>document.fonts.ready);
      const data=await page.evaluate(()=>{
        const visible=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const controls=[...document.querySelectorAll('button,input,select,textarea,[role="button"]')].filter(visible);
        const name=n=>n.getAttribute('aria-label')||n.getAttribute('title')||n.textContent?.trim().slice(0,75)||n.getAttribute('placeholder')||'';
        return {title:document.title,heading:[...document.querySelectorAll('h1')].map(n=>n.textContent),mainCount:document.querySelectorAll('main').length,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:controls.length,smallTargets:controls.filter(n=>{const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>({name:name(n),width:Math.round(n.getBoundingClientRect().width),height:Math.round(n.getBoundingClientRect().height)})).slice(0,45),unnamed:controls.filter(n=>!name(n)&&!n.getAttribute('aria-labelledby')&&!(n.labels?.length)).map(n=>n.outerHTML.slice(0,180)).slice(0,10),inputs:controls.filter(n=>n.matches('input,textarea,select')).map(n=>({name:name(n),font:getComputedStyle(n).fontSize,label:!!(n.labels?.length||n.getAttribute('aria-label')||n.getAttribute('aria-labelledby'))})),animations:document.getAnimations().map(a=>({name:a.animationName||a.constructor.name,duration:a.effect?.getTiming().duration,iterations:a.effect?.getTiming().iterations})),bodySample:document.body.innerText.slice(-450)};
      });
      const filename=`audit-${browserName}-${mode}-${route.replace(/[^a-z0-9-]/gi,'_').slice(0,110)}.png`;
      await page.screenshot({path:path.join(artifacts,filename)});
      rows.push({route,mode,status:response?.status(),landed:new URL(page.url()).pathname,...data,errors,screenshot:filename});
    }catch(error){rows.push({route,mode,error:error.message});}
    finally{page.off('pageerror',listener);}
  };
  for(const route of publicRoutes)await inspect(route,'desktop-light');
  await page.goto(origin+'/auth/login');await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);await page.locator('button[type="submit"]').click();await page.waitForURL(u=>u.pathname==='/dashboard');
  const routes=browserName==='chromium'?privateRoutes:['/dashboard','/profile',`/projects/${owner.projectId}/work`,`/projects/${owner.projectId}/modules`,`/organizations/${owner.organizationId}/billing`];
  for(const route of routes)await inspect(route,'desktop-light');
  await context.addCookies([{name:'theme',value:'dark',url:origin}]);await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  for(const route of routes)await inspect(route,'desktop-dark-reduce');
  await page.setViewportSize({width:375,height:812});
  for(const route of routes)await inspect(route,'phone-dark-reduce');
  await context.addCookies([{name:'theme',value:'light',url:origin}]);await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
  for(const route of routes)await inspect(route,'phone-light');
  if(browserName==='chromium'){
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    const card=page.locator('[data-card-id]').first();await card.click();
    const input=page.locator('#task-title');await input.waitFor();
    const title=await input.inputValue();await input.fill(title+' UNSAVED AUDIT');
    await page.keyboard.press('Escape');
    const closed=await page.getByRole('dialog').count()===0;
    await card.click();await input.waitFor();
    rows.push({scenario:'unsaved-task-edit-escape',closedWithoutConfirmation:closed,draftLost:await input.inputValue()===title});
    await page.keyboard.press('Escape');
    const ai=page.locator('div.fixed.bottom-6.right-6 button');
    if(await ai.count()){
      await ai.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
      await dialog.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
      rows.push({scenario:'ai-chat-phone',bounds:await dialog.boundingBox(),viewport:page.viewportSize(),sendButtonLabel:await dialog.locator('button[type="submit"]').getAttribute('aria-label'),liveRegions:await dialog.locator('[aria-live],[role="log"]').count()});
      await page.screenshot({path:path.join(artifacts,'audit-ai-chat-phone.png')});
      await page.keyboard.press('Escape');
    }
  }
  if(browserName==='chromium'){
    await page.goto(origin+'/auth/logout');await page.waitForURL(u=>u.pathname==='/');
    for(const route of publicRoutes)await inspect(route,'phone-light');
  }
  await writeFile(path.join(artifacts,`design-audit-${browserName}.json`),JSON.stringify(rows,null,2));
  console.log(`Design audit ${browserName}: ${rows.length} page observations`);
}
