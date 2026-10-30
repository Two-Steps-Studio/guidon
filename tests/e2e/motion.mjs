import assert from 'node:assert/strict';
import path from 'node:path';

export async function motionCoverage({page, origin, browserName, artifacts}) {
  const viewport = page.viewportSize();
  try {
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin + '/');
    const laptop = page.locator('[data-marketing-motion="laptop"]');
    await laptop.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-marketing-motion="laptop"]')?.dataset.play === 'true');
    assert.equal(await laptop.locator('img').first().evaluate(node => getComputedStyle(node).opacity), '1', 'The real screenshot is never faded out for its entrance');
    const scene = page.locator('[data-marketing-motion="context"]');
    await scene.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-marketing-motion="context"]')?.dataset.play === 'true');
    const timing = await scene.evaluate(node => node.getAnimations({subtree:true}).map(animation => {
      animation.pause(); animation.currentTime = 1400;
      return {duration:animation.effect.getTiming().duration, iterations:animation.effect.getTiming().iterations,
        keys:animation.effect.getKeyframes().flatMap(frame => Object.keys(frame).filter(key => !['offset','computedOffset','easing','composite'].includes(key)))};
    }));
    assert.ok(timing.length >= 4, 'The contextual demo has coordinated actors');
    for (const animation of timing) {
      assert.equal(animation.iterations, 1, 'No infinite marketing loops');
      assert.ok(animation.duration <= 3600);
      assert.ok(animation.keys.every(key => ['opacity','transform'].includes(key)), 'Only compositor properties animate');
    }
    await page.screenshot({path:path.join(artifacts,`${browserName}-motion-context.png`),fullPage:false});
    await page.evaluate(() => scrollTo(0,0));
    await page.waitForFunction(() => document.querySelector('[data-marketing-motion="context"]')?.dataset.paused === 'true');
    await scene.scrollIntoViewIfNeeded();
    await scene.getByRole('button').press('Enter');
    assert.equal(await scene.evaluate(node => node.getAnimations({subtree:true}).some(animation => animation.playState === 'running')), false, 'Keyboard does not start a replay');
    await page.emulateMedia({reducedMotion:'reduce'});
    await scene.getByRole('button').click();
    const gentle = await scene.evaluate(node => node.getAnimations({subtree:true}).map(animation => ({
      duration:animation.effect.getTiming().duration,
      frames:animation.effect.getKeyframes(),
    })));
    assert.ok(gentle.length > 0);
    for (const animation of gentle) {
      assert.ok(animation.duration <= 125);
      assert.ok(animation.frames.every(frame => !('transform' in frame)), 'Reduced motion has no spatial movement');
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:375,height:812});
    await scene.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await scene.locator('[data-motion-actor="task"]').evaluate(node => getComputedStyle(node).animationName.includes('gentle-arrive')), true, 'Mobile uses a simpler fade');
    await scene.evaluate(node => node.getAnimations({subtree:true}).forEach(animation => animation.finish()));
    await page.screenshot({path:path.join(artifacts,`${browserName}-motion-mobile.png`),fullPage:false});

    await page.evaluate(() => {
      window.__faqCalls = [];
      const original = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        if (this.closest('details')) window.__faqCalls.push({frames,options});
        return original.call(this,frames,options);
      };
    });
    const question = page.locator('details').first().locator('summary');
    await question.click();
    await page.waitForFunction(() => window.__faqCalls.length > 0);
    assert.equal(await page.locator('details').first().evaluate(node => node.open), true);
    const faqCalls = await page.evaluate(() => window.__faqCalls.length);
    await question.press('Enter'); await question.press('Enter');
    assert.equal(await page.locator('details').first().evaluate(node => node.open), true);
    assert.equal(await page.evaluate(() => window.__faqCalls.length), faqCalls, 'Native keyboard FAQ toggles do not animate');

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
