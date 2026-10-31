import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPlanPrice} from '../src/lib/billing/public-pricing.ts';

const plan={id:'pro',price_cents:1000,price_pln_cents:4500};
const prices=[{plan_id:'pro',billing_interval:'year',amount_cents:10000},{plan_id:'pro',billing_interval:'month',amount_cents:1000}];
test('configured EUR catalogue prices are shown exactly, never relabelled PLN',()=>{
  for(const currency of ['EUR','PLN']){
    assert.deepEqual(publicPlanPrice(plan,prices,'year',currency),{cents:10000,currency:'EUR'});
    assert.deepEqual(publicPlanPrice(plan,prices,'month',currency),{cents:1000,currency:'EUR'});
  }
});
test('unconfigured periods are unavailable, never estimated from monthly prices',()=>{
  assert.equal(publicPlanPrice(plan,prices,'week','EUR').cents,undefined);
  assert.equal(publicPlanPrice(plan,[],'year','PLN').cents,undefined);
  assert.equal(publicPlanPrice(plan,[],'month','PLN').cents,4500);
  assert.deepEqual(publicPlanPrice({...plan,price_pln_cents:null},[],'month','PLN'),{cents:1000,currency:'EUR'});
});
test('free and custom plans retain their meaning for all intervals',()=>{
  for(const interval of ['week','month','year']){
    assert.equal(publicPlanPrice({...plan,price_cents:0},prices,interval,'EUR').cents,0);
    assert.equal(publicPlanPrice({...plan,price_cents:null},prices,interval,'EUR').cents,null);
  }
});
