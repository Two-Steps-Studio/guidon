import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

export async function landingDesignCoverage({page,origin,browserName,artifacts}) {
  const cookies=await page.context().cookies();
  const errors=[];
  const onError=error=>errors.push(error.message);
  page.on('pageerror',onError);
  try {
    for(const theme of ['light','dark']) {
      await page.context().addCookies([{name:'theme',value:theme,url:origin}]);
      await page.emulateMedia({reducedMotion:'no-preference',colorScheme:theme});
      for(const size of [{width:1440,height:1000},{width:834,height:1112},{width:390,height:844},{width:320,height:812}]) {
        await page.setViewportSize(size);
        await page.goto(origin+'/');
        await page.getByRole('heading',{level:1,name:'Keep the why with the work.'}).waitFor();
        assert.equal(await page.locator('main').count(),1);
        assert.equal(await page.locator('h1').count(),1);
        assert.equal(await page.locator('[data-app-background]').count(),0,'Only the homepage opts out of the app background');
        assert.equal(await page.locator('[data-scroll-stage], [data-stage-tilt]').count(),0,'No sticky camera or cursor tilt');
        const canonical=new URL(await page.locator('link[rel="canonical"]').getAttribute('href'));
        assert.equal(canonical.origin,origin);assert.equal(canonical.pathname,"/");
        assert.equal(await page.locator('link[type="text/markdown"]').count(),1);
        const graph=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'];
        assert.ok(graph.some(node=>node['@type']==='SoftwareApplication'));
        assert.equal(graph.find(node=>node['@type']==='FAQPage').mainEntity.length,await page.locator('details').count());
        const ids=await page.locator('main > section[id]').evaluateAll(nodes=>nodes.map(node=>node.id));
        assert.ok(ids.indexOf('product')<ids.indexOf('features')&&ids.indexOf('features')<ids.indexOf('integrations'));
        assert.equal(await page.getByRole('button',{name:/Replay animation|Odtwórz animację/}).count(),0);
        const font=await page.locator('h1').evaluate(node=>getComputedStyle(node).fontFamily);
        assert.ok(font.toLowerCase().includes('geist'),'The display type matches Guidon’s existing brand');
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
        for(const anchor of await page.locator('header nav a[href^="#"]').all()) {
          assert.equal(await page.locator(await anchor.getAttribute('href')).count(),1,'Every visible navigation anchor resolves');
        }
        // Collect the initial viewport before activating below-the-fold reveals.
        await page.locator('[data-product-screen] img:visible').evaluate(node=>node.decode());
        await page.screenshot({path:path.join(artifacts,`${browserName}-landing-${theme}-${size.width}.png`)});
        for(const section of await page.locator('main > section').all()) {
          await section.scrollIntoViewIfNeeded();
          for(const image of await section.locator('img:visible').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(node=>node.decode());}
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${theme} ${size.width}: no horizontal overflow at any section`);
        }
        // Settle the decorative animation for a deterministic visual reference.
        await page.evaluate(()=>document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity)animation.finish();}));
        await page.evaluate(()=>scrollTo(0,0));
        if(size.width!==320)await page.screenshot({path:path.join(artifacts,`${browserName}-landing-${theme}-${size.width}-full.png`),fullPage:true});
        if(browserName==='chromium') {
          const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
          await writeFile(path.join(artifacts,`landing-a11y-${theme}-${size.width}.json`),JSON.stringify(a11y.violations,null,2));
          assert.deepEqual(a11y.violations.map(violation=>({id:violation.id,nodes:violation.nodes.map(node=>node.target)})),[]);
        }
      }
    }
    if(browserName==='chromium') {
      await page.setViewportSize({width:320,height:812});
      for(const locale of ['pl','de','es']) {
        await page.context().addCookies([{name:'NEXT_LOCALE',value:locale,url:origin}]);
        await page.goto(origin+'/');
        assert.equal(await page.locator('html').getAttribute('lang'),locale);
        assert.ok((await page.locator('header nav').getByRole('link').last().boundingBox()).height<=48,'Mobile navigation action stays on one line');
        for(const section of await page.locator('main > section').all()) {
          await section.scrollIntoViewIfNeeded();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${locale}: no overflow at 320px`);
        }
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({path:path.join(artifacts,`landing-${locale}-320.png`)});
      }
    }
    await page.context().addCookies([{name:'NEXT_LOCALE',value:'en',url:origin}]);
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/');
    await page.keyboard.press('Tab');
    await page.getByRole('link',{name:'Skip to content',exact:true}).press('Enter');
    assert.equal(await page.locator('#landing-main').evaluate(node=>node===document.activeElement),true);
    const screen=page.locator('[data-product-screen]');
    await screen.getByRole('button').nth(1).click();
    await page.waitForFunction(()=>document.querySelector('[data-product-screen] img').getAttribute('src').includes('taskBoard-light'));
    assert.equal(await screen.getByRole('button').nth(1).getAttribute('aria-pressed'),'true');
    await screen.getByRole('button').nth(2).focus();await page.keyboard.press('Enter');
    assert.equal(await screen.getByRole('button').nth(2).getAttribute('aria-pressed'),'true');
    const question=page.locator('details summary').first();
    await question.scrollIntoViewIfNeeded();await question.press('Enter');
    assert.equal(await page.locator('details').first().evaluate(node=>node.open),true);
    await question.press('Enter');assert.equal(await page.locator('details').first().evaluate(node=>node.open),false);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(origin+'/');
    await page.locator('[data-reveal-group]').first().scrollIntoViewIfNeeded();
    const animations=await page.locator('[data-landing]').evaluate(node=>node.getAnimations({subtree:true}).map(animation=>animation.effect.getKeyframes()));
    assert.ok(animations.every(frames=>frames.every(frame=>!('transform' in frame))),'Reduced motion has no spatial movement');
    assert.deepEqual(errors,[]);
    const noJs=await page.context().browser().newContext({javaScriptEnabled:false,ignoreHTTPSErrors:true,locale:"en-US",viewport:{width:390,height:844}});
    try {
      const fallback=await noJs.newPage();
      const imageRequests=[];
      fallback.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/_next/image'))imageRequests.push({url:response.url(),status:response.status()});});
      fallback.on('requestfailed',request=>{if(new URL(request.url()).pathname.startsWith('/_next/image'))imageRequests.push({url:request.url(),failed:request.failure()?.errorText});});
      await fallback.goto(origin+'/');
      await fallback.getByRole('heading',{level:1}).waitFor();
      // Wait for actual browser network loading. Firefox with page JS disabled
      // does not consistently settle the image.decode() promise.
      await fallback.waitForLoadState('networkidle');
      await fallback.screenshot({path:path.join(artifacts,`${browserName}-landing-no-js.png`)});
      const imageState=await fallback.locator('[data-product-screen] img').evaluateAll(nodes=>nodes.map(node=>({src:node.currentSrc,complete:node.complete,width:node.naturalWidth,display:getComputedStyle(node).display,loading:node.loading})));
      await writeFile(path.join(artifacts,`${browserName}-no-js-images.json`),JSON.stringify({imageState,imageRequests},null,2));
      assert.ok(await fallback.locator('[data-product-screen] img:visible').evaluate(node=>node.complete&&node.naturalWidth>0),JSON.stringify(imageState));
      assert.equal(await fallback.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.ok(await fallback.getByRole('link',{name:'Start free',exact:true}).count()>0);
    } finally {await noJs.close();}
  } finally {
    page.off('pageerror',onError);
    const previous=cookies.find(cookie=>cookie.name==='theme');
    if(previous)await page.context().addCookies([previous]);
    else await page.context().clearCookies({name:'theme'});
    const oldLocale=cookies.find(cookie=>cookie.name==='NEXT_LOCALE');
    if(oldLocale)await page.context().addCookies([oldLocale]);else await page.context().clearCookies({name:'NEXT_LOCALE'});
    await page.emulateMedia({reducedMotion:'no-preference',colorScheme:'light'});
  }
}
