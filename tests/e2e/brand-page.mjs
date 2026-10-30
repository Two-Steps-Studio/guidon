import assert from 'node:assert/strict';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

export async function brandPageCoverage({page, origin, browserName, artifacts}) {
  const context = page.context();
  const previousLocale = (await context.cookies(origin)).find(cookie => cookie.name === 'NEXT_LOCALE');
  const viewport = page.viewportSize();
  try {
    for (const [locale, heading] of [['en', 'One identity. Every touchpoint.'], ['pl', 'Jedna marka. W każdym miejscu.']]) {
      await context.addCookies([{name:'NEXT_LOCALE', value:locale, url:origin}]);
      const response = await page.goto(origin + '/brand');
      assert.equal(response.status(), 200, 'Brand guidelines are public without signing in');
      assert.equal(new URL(page.url()).pathname, '/brand');
      await page.getByRole('heading', {level:1, name:heading, exact:true}).waitFor();
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), origin + '/brand');
      for (const hex of ['#1D4FD8','#4D8DFF','#07142D','#FFFFFF','#0F172A']) {
        await page.getByText(hex, {exact:true}).waitFor();
      }
      const assets = await page.locator('a[download]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
      assert.equal(assets.length, 4);
      if (locale === 'en') for (const asset of assets) {
        const download = await page.request.get(origin + asset);
        assert.equal(download.status(), 200, `Available download: ${asset}`);
        assert.match(download.headers()['content-type'], /^image\/(png|svg\+xml)/);
        assert.ok((await download.body()).length > 100);
      }
      await page.setViewportSize({width:locale === 'pl' ? 320 : 1440, height:900});
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Brand page fits narrow screens');
      await page.waitForLoadState('networkidle');
      const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
      assert.deepEqual(axe.violations.map(({id}) => id), [], 'Brand page accessibility');
      await page.screenshot({path:path.join(artifacts, `${browserName}-brand-${locale}.png`), fullPage:true});
    }
    const sitemap = await (await page.request.get(origin + '/sitemap.xml')).text();
    assert.ok(sitemap.includes(`${origin}/brand</loc>`));
    await page.getByRole('contentinfo').getByRole('link', {name:'Zasady marki', exact:true}).waitFor();
  } finally {
    await context.clearCookies({name:'NEXT_LOCALE'});
    if (previousLocale) await context.addCookies([previousLocale]);
    if (viewport) await page.setViewportSize(viewport);
  }
}
