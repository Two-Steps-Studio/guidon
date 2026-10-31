import assert from 'node:assert/strict';
import path from 'node:path';

// Written ONLY into the runner's disposable source copy, never into the app.
// Self-hosted homepages intentionally have no Cloud pricing catalogue.
export const pricingFixturePage = `
import {PricingSection} from '@/app/pricing-section';
const base={price_pln_cents:4500,project_limit:10,task_limit_per_project:null,storage_limit_bytes:null,
has_ai_features:true,has_github_integration:true,has_advanced_analytics:false,has_team_roles:true,has_audit_logs:false,has_priority_support:false};
export default function Fixture(){return <>
  <div data-home-hero style={{height:'100vh'}}>Disposable pricing fixture</div>
  <div style={{height:'200vh'}}>Product tour</div>
  <PricingSection plans={[
    {...base,id:'free',name:'Free',price_cents:0},
    {...base,id:'pro',name:'Pro',price_cents:1000},
    {...base,id:'enterprise',name:'Enterprise',price_cents:null},
  ]} prices={[
    {plan_id:'pro',billing_interval:'month',amount_cents:1000},
    {plan_id:'pro',billing_interval:'year',amount_cents:10000},
  ]}/>
  <div style={{height:'100vh'}}>Footer</div>
</>}
`;

export async function landingPricingCoverage({page,origin,browserName,artifacts,fixture}) {
  await page.goto(origin+'/auth/e2e-pricing');
  const pricing=page.locator('#pricing');
  // Card has no data-slot in some deployments; select by its heading instead.
  const proCard=pricing.getByRole('heading',{name:'Pro',exact:true}).locator('..').locator('..');
  await page.evaluate(()=>scrollTo(0,innerHeight*1.1));
  const navigator=page.getByRole('complementary',{name:'Explore plans'});
  await navigator.waitFor();
  await navigator.getByRole('button',{name:'Yearly',exact:true}).click();
  await navigator.waitFor({state:'hidden'});
  assert.equal(await pricing.getByRole('button',{name:'Yearly',exact:true}).getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>document.activeElement?.id==='pricing');
  await proCard.getByText('€100.00',{exact:false}).waitFor();
  const link=proCard.getByRole('link',{name:'Get Started',exact:true});
  const signup=new URL(await link.getAttribute('href'),origin);
  const upgrade=new URL(signup.searchParams.get('redirect'),origin);
  assert.equal(upgrade.searchParams.get('interval'),'year');
  assert.equal(upgrade.searchParams.get('plan'),'pro');
  await pricing.getByRole('button',{name:'PLN',exact:true}).click();
  await proCard.getByText('€100.00',{exact:false}).waitFor();
  await pricing.getByRole('button',{name:'Weekly',exact:true}).click();
  await proCard.getByText('Not available',{exact:true}).waitFor();
  assert.equal(await proCard.getByRole('link',{name:'Contact us',exact:true}).getAttribute('href'),'/contact');
  const free=pricing.getByRole('heading',{name:'Free',exact:true}).locator('..').locator('..');
  await free.getByRole('link',{name:'Get Started',exact:true}).waitFor();
  const custom=pricing.getByRole('heading',{name:'Enterprise',exact:true}).locator('..').locator('..');
  assert.equal(await custom.getByRole('link',{name:'Contact us',exact:true}).getAttribute('href'),'/contact');
  await pricing.getByRole('button',{name:'Monthly',exact:true}).focus();
  await page.keyboard.press('Enter');
  await proCard.getByText('€10.00',{exact:false}).waitFor();
  for(const width of [375,1440]) {
    await page.setViewportSize({width,height:900});
    await pricing.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(artifacts,browserName+'-pricing-'+width+'.png')});
  }
  await page.goto(origin+'/auth/login');
  await page.locator('#email').fill(fixture.users[0].email);
  await page.locator('#password').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url=>url.pathname==='/dashboard');
  await page.goto(origin+'/upgrade?plan=pro&interval=year');
  await page.waitForURL(url=>url.pathname===`/organizations/${fixture.users[0].organizationId}/billing`);
  assert.equal(new URL(page.url()).searchParams.get('interval'),'year','Upgrade preserves the chosen billing period');
  assert.equal(new URL(page.url()).searchParams.get('plan'),'pro');

}
