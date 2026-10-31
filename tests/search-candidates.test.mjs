import test from 'node:test';
import assert from 'node:assert/strict';
import {taskCandidates} from '../src/lib/search/task-candidates.ts';
import {rankTasks,taskRefBounds,taskRefPrefix} from '../src/lib/search/task-search-core.ts';

function client(responses){
  const queries=[];
  return {queries,from(table){
    const index=queries.length, calls=[['from',table]];queries.push(calls);
    const builder={then(resolve,reject){return Promise.resolve(responses[index]??{data:[],error:null}).then(resolve,reject);}};
    for(const name of ['select','eq','ilike','order','limit','gte','lte'])builder[name]=(...args)=>{calls.push([name,...args]);return builder;};
    return builder;
  }};
}
const row=(id,title,description)=>({id,title,description,status:'todo',priority:'medium',project_id:'test-project',updated_at:'2026-01-01'});
test('explicit all-letter references and full/partial IDs have inclusive canonical bounds',()=>{
  assert.equal(taskRefPrefix('facade'),null);
  assert.equal(taskRefPrefix('guidon#ABCDEF'),'abcdef');
  assert.deepEqual(taskRefBounds('guidon#ABCDEF'),{lower:'abcdef00-0000-0000-0000-000000000000',upper:'abcdefff-ffff-ffff-ffff-ffffffffffff'});
  const uuid='aabbcc12-1234-4567-89ab-123456789abc';
  assert.deepEqual(taskRefBounds(uuid),{lower:uuid,upper:uuid});
  assert.equal(taskRefBounds('not an ID'),null);
  assert.equal(taskRefBounds('123456789012345678901234567890123'),null);
});
test('exact lookup survives a saturated substring page and recent sample; every query stays project scoped',async()=>{
  const target=row('aabbcc12-1234-4567-89ab-123456789abc','50%_off');
  const db=client([{data:Array.from({length:2000},(_,i)=>row(String(i),'Unrelated')),error:null},{data:[target],error:null},
    {data:Array.from({length:50},(_,i)=>row('sub'+i,'50%_off variant')),error:null}]);
  const result=await taskCandidates(db,'50%_off','test-project');
  assert.equal(rankTasks('50%_off',result.tasks)[0].task.id,target.id);
  assert.equal(result.limited,true);
  assert.ok(db.queries.every(query=>query.some(call=>call[0]==='eq'&&call[1]==='project_id'&&call[2]==='test-project')));
  assert.ok(db.queries[1].some(call=>call[0]==='ilike'&&call[2]==='50\\%\\_off'));
});
test('old references use UUID range queries and merged descriptions are preserved',async()=>{
  const id='aabbcc12-1234-4567-89ab-123456789abc',target=row(id,'Old task','Full description');
  const db=client([{data:[{...target,description:undefined}],error:null},{data:[],error:null},{data:[],error:null},{data:[target],error:null},{data:[target],error:null}]);
  const result=await taskCandidates(db,'aabbcc12',null);
  assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].description,'Full description');
  assert.equal(result.limited,false);
  assert.ok(db.queries[4].some(call=>call[0]==='gte'&&call[1]==='id'));
  assert.ok(db.queries[4].some(call=>call[0]==='lte'&&call[1]==='id'));
});
test('database failure is not reported as a successful empty result or echoed to callers',async()=>{
  const db=client([{data:null,error:{message:'PRIVATE query and row content'}}]);
  await assert.rejects(taskCandidates(db,'secret title',null),error=>error.message==='Could not load search candidates');
});
test('ties have a stable ID order independent of candidate arrival order',()=>{
  assert.deepEqual(rankTasks('same',[row('b','Same'),row('a','Same')]).map(result=>result.task.id),['a','b']);
});
