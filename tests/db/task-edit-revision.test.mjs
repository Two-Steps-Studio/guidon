import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as compiler from "../../src/lib/data-client/sql.ts";
import * as recurrence from "../../src/lib/work/recurrence-core.ts";

const db=new PGlite();
async function sql(path){return (await readFile(new URL(path,import.meta.url),"utf8")).replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g,"SELECT 1;");}
await db.exec(await sql("../../src/db/bootstrap/000_auth_compat.sql"));
for(const file of (await readdir(new URL("../../src/db/migrations/",import.meta.url))).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await db.exec(await sql(`../../src/db/migrations/${file}`));
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'revision-a@example.test'),($2,'revision-b@example.test')",[A,B]);
async function asUser(id,fn){
 await db.exec("BEGIN");
 try{await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:"authenticated"})]);await db.exec("SET LOCAL ROLE authenticated");const result=await fn();await db.exec("COMMIT");return result;}
 catch(error){await db.exec("ROLLBACK");throw error;}
}
const org=await asUser(A,async()=>(await db.query("INSERT INTO organizations(name,slug) VALUES('Revision test','revision-test') RETURNING id")).rows[0].id);
const project=await asUser(A,async()=>(await db.query("INSERT INTO projects(organization_id,name,visibility) VALUES($1,'Revision private','private') RETURNING id",[org])).rows[0].id);
const task=await asUser(A,async()=>(await db.query("INSERT INTO tasks(project_id,title,created_by) VALUES($1,'Original',$2) RETURNING *",[project,A])).rows[0]);
assert.equal(task.revision,0);
async function load(path,dependencies){
 const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,process,Date,console,require(name){assert.ok(Object.hasOwn(dependencies,name),`Unexpected dependency ${name}`);return dependencies[name];}});return exports;
}
const adapter=await load("../../src/lib/data-client/index.ts",{"server-only":{},"@/lib/db/pool":{hasDirectDatabase:()=>true},"@/lib/db/session":{withUser:(id,fn)=>asUser(id,()=>fn({query:(q,v)=>db.query(q,v)}))},"@/lib/supabase-server":{},"./sql":compiler});
let actor=A,role="owner",activities=0,events=0;
const actions=await load("../../src/app/projects/[id]/work/actions.ts",{
 "next/cache":{revalidatePath(){}},"@/lib/data/project-access":{getProjectAccess:async()=>({userId:actor,role}),canWriteProject:r=>["owner","admin","developer"].includes(r),canManageProject:r=>["owner","admin"].includes(r)},
 "@/lib/data-client":adapter,"@/lib/data/log-activity":{logActivity:async()=>{activities++;}},"@/lib/data/notifications":{createNotification:async()=>{}},
 "@/lib/events/task-events":{emitTaskEvent:()=>{events++;}},"@/lib/limits":{},"@/lib/work/task-board":{},"@/lib/work/recurrence":{ensureNextOccurrence:async()=>[]},"@/lib/work/recurrence-core":recurrence,"@/lib/i18n/server-errors":{tr:async text=>text},
});
try{
 const first=await actions.updateTask(project,task.id,{title:"First editor",description:"Preserve this"},0);
 assert.equal(first.error,null);assert.equal(first.task.revision,1);
 const stale=await actions.updateTask(project,task.id,{title:"Stale overwrite",description:"Lost"},0);
 assert.equal(stale.code,"conflict");assert.equal(activities,1);assert.equal(events,0);
 const row=(await db.query("SELECT * FROM tasks WHERE id=$1",[task.id])).rows[0];assert.equal(row.title,"First editor");assert.equal(row.description,"Preserve this");
 // All writers, including service/API partial updates, advance the version.
 await db.query("UPDATE tasks SET priority='high', revision=0 WHERE id=$1",[task.id]);
 assert.equal((await db.query("SELECT revision FROM tasks WHERE id=$1",[task.id])).rows[0].revision,2);
 assert.equal((await actions.updateTask(project,task.id,{title:"Stale after API"},1)).code,"conflict");
 for(const value of [-1,1.5,"2",NaN,2147483647])assert.equal((await actions.updateTask(project,task.id,{title:"Invalid"},value)).code,"version_unavailable");
 actor=B;assert.equal((await actions.updateTask(project,task.id,{title:"Foreign"},2)).code,"conflict");
 actor=A;role="viewer";assert.match((await actions.updateTask(project,task.id,{title:"Viewer"},2)).error,/permission/);
 role="owner";const partial=await actions.updateTask(project,task.id,{title:"Compatible partial client"});assert.equal(partial.error,null);assert.equal(partial.task.revision,3);
 assert.equal((await actions.updateTask(project,task.id,{title:"After refresh"},3)).task.revision,4);
 console.log("pass actual task action/adapter/SQL: first edit, stale CAS, all-writer monotonic revision, invalid versions, foreign/viewer denial, preserved fields, no conflict side effects and legacy partial-client compatibility");
}finally{await db.close();}
