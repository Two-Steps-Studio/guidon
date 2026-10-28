import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { request as playwrightRequest } from 'playwright';

/*
 * The whole Context Engine loop as an agent sees it (Guidon task 9ddf32fc),
 * through the real MCP endpoint, GitHub webhook and task dialog:
 * a task with a decision and a project rule -> the agent reads the context,
 * starts, records a failed attempt -> its commit and PR are linked (replayed
 * and out-of-order deliveries included) -> the next context shows the
 * failure first and the merged PR -> it hands the task back for review ->
 * memory learned from the finished task cites it, and goes when the task is
 * reopened -> the Why panel shows the decision. Another tenant's repository
 * and key reach none of it. get_task_context latency over a 300-entry
 * memory is measured against a budget.
 */
export async function agentLoopCoverage({page,context,origin,fixture,client,browserName,webhookSecret}){
 const [owner,foreign]=fixture.users;
 const http=await playwrightRequest.newContext({baseURL:origin,ignoreHTTPSErrors:true,timeout:20000,maxRedirects:0});
 const repo=`loop-${browserName}`,foreignRepo=`foreign-${browserName}`;
 const created={project:null,keys:[]};
 const key=async(user,name)=>{
  const raw=`guidon_${randomBytes(32).toString('base64url')}`;
  const id=(await client.query("INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes) VALUES($1,$2,$3,$4,$5) RETURNING id",[user.id,name,raw.slice(0,12),createHash('sha256').update(raw).digest('hex'),['tasks:read','tasks:write','tasks:status','comments:write','attempts:write','project:read','project:write']])).rows[0].id;
  created.keys.push(id);return raw;
 };
 let rpcId=0;
 const call=async(apiKey,name,args)=>{
  const response=await http.post('/api/mcp',{headers:{authorization:`Bearer ${apiKey}`,accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},data:{jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}}});
  assert.equal(response.status(),200,await response.text());
  const body=await response.json();
  assert.ok(body.result,`${name} must be a registered tool`);
  return {error:Boolean(body.result.isError),text:(body.result.content??[]).map(item=>item.text??'').join('\n')};
 };
 const webhook=async(event,repository,body)=>{
  const raw=JSON.stringify({repository:{name:repository,owner:{login:'acme'}},installation:{id:4343},...body});
  const response=await context.request.post(`${origin}/api/github/webhook`,{headers:{'content-type':'application/json','x-github-event':event,'x-hub-signature-256':`sha256=${createHmac('sha256',webhookSecret).update(raw).digest('hex')}`},data:raw});
  assert.equal(response.status(),200,await response.text());
 };
 const links=async()=>(await client.query("SELECT kind, external_ref, status, pr_state FROM public.task_links WHERE project_id=$1 ORDER BY kind, external_ref",[created.project])).rows;
 try{
  await client.query('BEGIN');
  try{
   await client.query('SET LOCAL ROLE authenticated');
   await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner.id,role:'authenticated'})]);
   created.project=(await client.query("INSERT INTO public.projects(organization_id,name,visibility) VALUES($1,$2,'private') RETURNING id",[owner.organizationId,`Agent loop ${browserName}`])).rows[0].id;
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  const projectId=created.project;
  const decision=(await client.query("INSERT INTO public.context_decisions(project_id,title,description,decision_type,status,made_by) VALUES($1,'Sessions live in signed cookies, not localStorage','XSS must not reach the session.','technical','approved',$2) RETURNING id",[projectId,owner.id])).rows[0].id;
  const task=(await client.query("INSERT INTO public.tasks(project_id,title,description,status,priority,decision_id,created_by) VALUES($1,'Keep users signed in after a password reset','Users are logged out right after resetting their password.','todo','high',$2,$3) RETURNING id",[projectId,decision,owner.id])).rows[0].id;
  const ref=`guidon#${task.slice(0,8)}`;
  await client.query("INSERT INTO public.project_memory(project_id,content,memory_type,created_by) VALUES($1,'Never store session tokens in localStorage','project_rule',$2)",[projectId,owner.id]);
  await client.query("INSERT INTO public.project_memory(project_id,content,memory_type,created_by) SELECT $1,'Observation '||g||' about the build pipeline and caching '||repeat('detail ',20),'observation',$2 FROM generate_series(1,300) g",[projectId,owner.id]);
  await client.query("INSERT INTO public.github_connections(project_id,connected_by,github_login,repo_owner,repo_name,default_branch,installation_id,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,refresh_token_expires_at) VALUES($1,$2,'qa','acme',$3,'main',4343,'unused','unused',now()+interval '1 day',now()+interval '30 days')",[projectId,owner.id,repo]);
  const agent=await key(owner,`E2E agent loop ${browserName}`);
  const intruder=await key(foreign,`E2E agent loop intruder ${browserName}`);

  // 1. The agent finds the task and reads its context - within budget.
  assert.match((await call(agent,'list_tasks',{project_id:projectId})).text,/Keep users signed in after a password reset/);
  const started=Date.now();
  const first=await call(agent,'get_task_context',{task_id:task});
  const latency=Date.now()-started;
  assert.equal(first.error,false,first.text);
  assert.match(first.text,/Never store session tokens in localStorage/,'The project rule is in the package');
  assert.match(first.text,/Sessions live in signed cookies/,'The linked decision is in the package');
  assert.ok(latency<5000,`get_task_context over 300 memory entries took ${latency} ms (budget 5000)`);

  // 2. It starts, tries something and records the failure.
  assert.equal((await call(agent,'start_task',{task_id:task})).error,false);
  assert.ok(['ai_working','in_progress'].includes((await client.query("SELECT status FROM public.tasks WHERE id=$1",[task])).rows[0].status));
  assert.equal((await call(agent,'record_attempt',{task_id:task,problem:'Logged out after reset',approach:'Cleared the cookie cache on reset',outcome:'failed',failure_reason:'The session id rotates on reset; the cache was not the cause',agent:'E2E agent'})).error,false);

  // 3. Its commit and PR are linked - a replayed push adds nothing, a late event doesn't un-merge.
  const push={ref:'refs/heads/main',commits:[{id:'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',message:`Keep the session across a reset ${ref}`,url:`https://github.com/acme/${repo}/commit/a1b2c3d`}]};
  await webhook('push',repo,push);
  await webhook('push',repo,push);
  const pr=(action,extra={})=>webhook('pull_request',repo,{action,number:5,pull_request:{title:`Keep the session across a password reset ${ref}`,body:'',html_url:`https://github.com/acme/${repo}/pull/5`,head:{ref:'session-reset'},base:{ref:'main'},user:{login:'agent'},updated_at:new Date().toISOString(),...extra}});
  await pr('opened');
  await pr('closed',{merged:true,state:'closed'});
  await pr('synchronize');
  assert.deepEqual((await links()).map(row=>[row.kind,row.external_ref,row.status,row.pr_state]),[['commit','a1b2c3d4e5f60718293a4b5c6d7e8f9012345678','confirmed',null],['pull_request','5','confirmed','merged']]);

  // Another tenant's repository mentioning this task links nothing.
  await client.query("INSERT INTO public.github_connections(project_id,connected_by,github_login,repo_owner,repo_name,default_branch,installation_id,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,refresh_token_expires_at) VALUES($1,$2,'qa','acme',$3,'main',4343,'unused','unused',now()+interval '1 day',now()+interval '30 days') ON CONFLICT (project_id) DO UPDATE SET repo_name=EXCLUDED.repo_name",[foreign.projectId,foreign.id,foreignRepo]);
  await webhook('push',foreignRepo,{ref:'refs/heads/main',commits:[{id:'ffffffffffffffffffffffffffffffffffffffff',message:`Steal ${ref}`,url:`https://github.com/acme/${foreignRepo}/commit/fffffff`}]});
  assert.equal((await client.query("SELECT count(*)::int n FROM public.task_links WHERE task_id=$1 AND repository=$2",[task,`acme/${foreignRepo}`])).rows[0].n,0,'A foreign repository cannot link to this task');
  assert.equal((await links()).length,2);

  // 4. The next context leads with the failure and shows the merged PR.
  const second=(await call(agent,'get_task_context',{task_id:task})).text;
  assert.match(second,/\[FAILED\] Logged out after reset/);
  assert.match(second,/The session id rotates on reset/);
  assert.match(second,new RegExp(`acme/${repo}#5[^\\n]*`));
  assert.match(second,/merged/);

  // 5. It hands the task back for review.
  assert.equal((await call(agent,'comment_on_task',{task_id:task,content:'Session now survives a reset; PR #5 merged.'})).error,false);
  assert.equal((await call(agent,'set_task_status',{task_id:task,status:'review'})).error,false);
  assert.equal((await client.query("SELECT status FROM public.tasks WHERE id=$1",[task])).rows[0].status,'review');

  // 6. Memory learned from the finished task cites it - and leaves when the task is reopened.
  await client.query("UPDATE public.tasks SET status='done' WHERE id=$1",[task]);
  const insight=(await client.query("INSERT INTO public.project_memory(project_id,content,memory_type,verified,created_by) VALUES($1,'A password reset rotates the session id','ai_insight',false,$2) RETURNING id",[projectId,owner.id])).rows[0].id;
  await client.query("INSERT INTO public.context_relations(source_type,source_id,target_type,target_id,relation_type,created_by,metadata) VALUES('memory',$1,'task',$2,'based_on',$3,'{\"origin\":\"task_learning\"}'::jsonb)",[insight,task,owner.id]);
  const learned=(await call(agent,'get_project_context',{project_id:projectId,focus:'password reset session'})).text;
  assert.match(learned,/A password reset rotates the session id/);
  assert.match(learned,new RegExp(`Evidence: task ${task}`));
  await client.query("UPDATE public.tasks SET status='todo' WHERE id=$1",[task]);
  assert.doesNotMatch((await call(agent,'get_project_context',{project_id:projectId,focus:'password reset session'})).text,/A password reset rotates the session id/,'A reopened task takes its unreviewed insight with it');

  // 7. Another tenant's agent gets nothing.
  for(const [name,args] of [['get_task_context',{task_id:task}],['get_project_context',{project_id:projectId}],['list_task_links',{task_id:task}]]){
   const result=await call(intruder,name,args);
   assert.equal(result.error,true,`${name} must refuse another tenant`);
   assert.doesNotMatch(result.text,/Keep users signed in|Sessions live in signed cookies|session tokens/);
  }

  // 8. The person sees the same decision and linked code in the task dialog.
  await context.clearCookies();await page.goto(`${origin}/auth/login`);
  await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);
  await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/dashboard');
  await page.goto(`${origin}/projects/${projectId}/work`);
  await page.locator(`article[data-card-id="${task}"] [data-task-open]`).click();
  await page.getByRole('region',{name:'Why'}).getByText('Sessions live in signed cookies, not localStorage').waitFor();
  await page.getByRole('region',{name:'Linked code'}).getByText(`acme/${repo}#5`).first().waitFor();
  console.log(`pass agent loop: context -> attempt -> links (replay, out-of-order, foreign repo) -> review -> evidence-backed memory -> Why panel; get_task_context ${latency} ms over 300 memory entries`);
 }finally{
  await client.query("DELETE FROM public.github_connections WHERE project_id=$1",[foreign.projectId]);
  if(created.keys.length)await client.query('DELETE FROM public.api_keys WHERE id = ANY($1)',[created.keys]);
  if(created.project)await client.query('DELETE FROM public.projects WHERE id=$1',[created.project]);
  await http.dispose();
  await page.goto(origin);await page.waitForLoadState('networkidle');await context.clearCookies();
 }
}
