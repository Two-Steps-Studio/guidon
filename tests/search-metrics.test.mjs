import test from 'node:test';
import assert from 'node:assert/strict';
import {isSearchEvent,weeklySearchCounts} from '../src/lib/search/search-metrics.ts';
import {countSearchEvent} from '../src/components/layout/search-metrics.ts';

test('event vocabulary has no channel for private search content',()=>{
  for(const value of ['results','zero','click','failed'])assert.equal(isSearchEvent(value),true);
  for(const value of ['zero secret','task title','user-id',{event:'zero',query:'private'},null])assert.equal(isSearchEvent(value),false);
});
test('UTC calendar weeks, empty data and zero denominators are explicit',()=>{
  const weeks=weeklySearchCounts([
    {day:'2026-10-26',event:'results',count:'3'}, {day:'2026-10-27',event:'zero',count:1},
    {day:'2026-10-25',event:'failed',count:2},{day:'2026-10-27',event:'click',count:2},
    {day:'2026-11-02',event:'zero',count:100},{day:'2026-10-27',event:'unknown',count:5},
    {day:'2026-10-27',event:'zero',count:-1},
  ],new Date('2026-10-31T23:59:59Z'));
  assert.equal(weeks.length,8);
  assert.deepEqual(weeks[0],{week:'2026-10-26',searches:4,zero:1,zeroPercent:25,clicks:2,failed:0});
  assert.equal(weeks[1].failed,2);assert.equal(weeks[1].zeroPercent,null);
  assert.equal(weeklySearchCounts([],new Date('2027-01-01'))[0].week,'2026-12-28');
});
test('browser payload is exactly an enum; privacy choices and transport failures never affect search',async()=>{
  const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const previousFetch=globalThis.fetch,calls=[];
  const navigator={sendBeacon:(url,body)=>{calls.push({url,body});return true;}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:navigator});
  try {
    countSearchEvent('zero');
    assert.equal(calls[0].url,'/api/search-metrics');assert.equal(await calls[0].body.text(),'zero');
    navigator.doNotTrack='1';countSearchEvent('results');assert.equal(calls.length,1);
    navigator.doNotTrack='0';navigator.globalPrivacyControl=true;countSearchEvent('click');assert.equal(calls.length,1);
    navigator.globalPrivacyControl=false;countSearchEvent('PRIVATE QUERY');assert.equal(calls.length,1);
    navigator.sendBeacon=()=>false;
    globalThis.fetch=(url,options)=>{calls.push({url,options});return Promise.reject(new Error('Offline'));};
    assert.doesNotThrow(()=>countSearchEvent('failed'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(await calls[1].options.body.text(),'failed');assert.equal(calls[1].options.keepalive,true);
  } finally {
    globalThis.fetch=previousFetch;
    if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
  }
});
