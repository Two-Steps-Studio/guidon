import assert from 'node:assert/strict';

export async function motionCoverage({page, origin, browserName, artifacts}) {
  const viewport = page.viewportSize();
  try {
    const {landingDesignCoverage} = await import('./landing-design.mjs');
    await landingDesignCoverage({page,origin,browserName,artifacts});
    await page.goto(origin + '/start');
    await page.waitForLoadState('networkidle');
    const stored = await page.evaluate(() => localStorage.getItem('guidon-onboarding'));
    // Observe actual WAAPI calls without changing playback or implementation.
    await page.evaluate(() => {
      window.__motionCalls = [];
      window.__originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        if (this.matches('[data-state-motion]')) window.__motionCalls.push({target:this.dataset.stateMotion,frames,options});
        return window.__originalAnimate.call(this,frames,options);
      };
    });
    await page.locator('#onboarding-project').fill('Motion test');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByRole('button',{name:/Website/}).waitFor();
    await page.waitForFunction(() => window.__motionCalls.length > 0);
    const pointerCalls = await page.evaluate(() => window.__motionCalls.length);
    await page.getByRole('button',{name:'Back',exact:true}).press('Enter');
    await page.locator('#onboarding-project').waitFor();
    await page.getByRole('button',{name:'Continue',exact:true}).press('Enter');
    await page.getByRole('button',{name:/Website/}).waitFor();
    assert.equal(await page.evaluate(() => window.__motionCalls.length), pointerCalls, 'Keyboard wizard navigation stays instant');
    await page.evaluate(previous => {
      Element.prototype.animate = window.__originalAnimate;
      if (previous === null) localStorage.removeItem('guidon-onboarding'); else localStorage.setItem('guidon-onboarding', previous);
    }, stored);
  } finally {
    await page.emulateMedia({reducedMotion:'no-preference'});
    if (viewport) await page.setViewportSize(viewport);
  }
}
