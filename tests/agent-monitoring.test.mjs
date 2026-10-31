import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitoringSnapshot } from '../src/lib/work/agent-monitoring-core.ts';

const now=Date.parse('2026-10-31T10:00:00Z');
const empty={tasks:[],claims:[],attempts:[],memory:[],approvals:[]};
test('custom status keys do not collide with JavaScript object properties',()=>{
  const result=monitoringSnapshot({...empty,tasks:[{id:'a',title:'A',status:'constructor'},{id:'b',title:'B',status:'__proto__'}]},now);
  assert.equal(result.statuses.constructor,1);
  assert.equal(result.statuses.__proto__,1);
});
test('counts distinct tasks and additional attempts without including foreign or duplicate records',()=>{
  const result=monitoringSnapshot({...empty,tasks:[{id:'a',title:'A',status:'review'},{id:'b',title:'B',status:'custom'}],attempts:[
    {id:'1',task_id:'a',agent:' Agent ',outcome:'failed',created_at:''},
    {id:'2',task_id:'a',agent:'Agent',outcome:'succeeded',created_at:''},
    {id:'2',task_id:'a',agent:'Agent',outcome:'succeeded',created_at:''},
    {id:'3',task_id:'b',agent:null,outcome:'partial',created_at:''},
    {id:'foreign',task_id:'other',agent:'foreign',outcome:'failed',created_at:''},
  ]},now);
  assert.deepEqual(result.statuses,{review:1,custom:1});
  assert.equal(result.repeatedAttempts,1);
  assert.equal(result.agents.find(x=>x.label==='Agent').tasks,1);
  assert.equal(result.agents.find(x=>x.label==='Agent').succeeded,1);
  assert.equal(result.agents.some(x=>x.label==='foreign'),false);
});
test('lease and approval expiry use the snapshot time, including the exact boundary',()=>{
  const result=monitoringSnapshot({...empty,claims:[{task_id:'a',holder_key_id:'key',holder_label:'A',claimed_at:'2026-10-31T09:45:00Z',expires_at:'2026-10-31T10:00:00Z'}],approvals:[
    {status:'pending',expires_at:'2026-10-31T10:00:00Z'},
    {status:'pending',expires_at:'2026-10-31T11:00:00Z'},
    {status:'approved',expires_at:'2026-10-31T11:00:00Z'},
  ]},now);
  assert.equal(result.claims[0].expired,true);
  assert.equal(result.claims[0].minutes,15);
  assert.equal(result.pendingApprovals,1);
});
test('memory freshness is a timestamp, not a fabricated score; missing costs stay absent',()=>{
  const result=monitoringSnapshot({...empty,memory:[{id:'a',verified:true,updated_at:'invalid'},{id:'b',verified:false,updated_at:'2026-10-30T10:00:00Z'},{id:'c',verified:null,updated_at:'2026-10-31T09:00:00Z'}]},now);
  assert.equal(result.latestMemory,'2026-10-31T09:00:00.000Z');
  assert.equal(result.unverifiedMemory,2);
  assert.equal('tokenCost' in result,false);
  assert.equal(monitoringSnapshot(empty,now).latestMemory,null);
});
