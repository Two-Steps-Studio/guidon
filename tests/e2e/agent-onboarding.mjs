import assert from 'node:assert/strict';

/*
 * Launch path for a new project (Guidon tasks a4f0d240 and 97117993):
 * starter tasks for the agent are added once, "Connect your agent" on the
 * board creates a key whose first MCP call flips the dialog to "Connected",
 * revoking it there makes /api/mcp refuse the key, and a viewer gets
 * neither button.
 */
export async function agentOnboardingCoverage({page,context,origin,fixture,client,browserName}){
 const owner=fixture.users[0];
 const name=`Agent onboarding ${browserName}`;
 let projectId=null;
 const started=new Date();
 const mcp=key=>fetch(`${origin}/api/mcp`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}).then(response=>response.status);
 const signIn=async user=>{await context.clearCookies();await page.goto(origin+'/auth/login');await page.waitForLoadState('networkidle');await page.locator('#email').fill(user.email);await page.locator('#password').fill(fixture.password);await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/dashboard');};
 await client.query('BEGIN');
 try{
  await client.query('SET LOCAL ROLE authenticated');
  await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner.id,role:'authenticated'})]);
  projectId=(await client.query("INSERT INTO public.projects(organization_id,name,visibility) VALUES($1,$2,'private') RETURNING id",[owner.organizationId,name])).rows[0].id;
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
 try{
  await signIn(owner);
  await page.goto(`${origin}/projects/${projectId}/work?welcome=1`);
  const starter=page.getByRole('button',{name:'Add starter tasks for your agent'}).first();
  await starter.click();
  await page.getByText('Agent: write down what this project is').first().waitFor();
  const rows=(await client.query("SELECT title,status,tags FROM public.tasks WHERE project_id=$1 ORDER BY sort_order",[projectId])).rows;
  assert.equal(rows.length,3,'Three starter tasks are added');
  assert.ok(rows.every(row=>row.status==='todo'&&row.tags.includes('agent')));
  assert.equal((await client.query("SELECT count(*)::int n FROM public.project_memory WHERE project_id=$1 AND memory_type='project_rule'",[projectId])).rows[0].n,1,'One project rule comes with them');
  assert.equal(await page.getByRole('button',{name:'Add starter tasks for your agent'}).count(),0,'The button goes away once the board has tasks');

  await page.getByRole('button',{name:'Connect your agent'}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('radio',{name:'Claude Code'}).click();
  await dialog.getByRole('button',{name:'Connect Claude Code'}).click();
  const key=(await dialog.locator('code').first().innerText()).match(/guidon_[A-Za-z0-9_-]+/)?.[0];
  assert.ok(key,'The setup command carries the new key');
  assert.match(await dialog.getByText(/^In my Guidon project/).innerText(),new RegExp(name),'The prompt to try names this project');
  await dialog.getByText('Waiting for your agent').waitFor();
  assert.equal(await mcp(key),200);
  await dialog.getByText(/Connected - your agent reached Guidon at/).waitFor({timeout:30000});
  await dialog.getByRole('button',{name:'Revoke this key'}).click();
  await dialog.getByText('Key revoked').waitFor();
  assert.equal(await mcp(key),401,'A key revoked from the dialog stops working at once');
  await page.keyboard.press('Escape');

  // Viewers can't create tasks or keys for the board, so neither button shows.
  await client.query("INSERT INTO public.project_members(project_id,user_id,role) VALUES($1,$2,'viewer')",[projectId,fixture.reader.id]);
  await signIn({email:fixture.reader.email});
  await page.goto(`${origin}/projects/${projectId}/work`);
  await page.getByText('Agent: write down what this project is').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Connect your agent'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Add starter tasks for your agent'}).count(),0);
 }finally{
  await client.query("DELETE FROM public.api_keys WHERE user_id=$1 AND name LIKE 'Claude Code (MCP)%' AND created_at>=$2",[owner.id,started]);
  if(projectId)await client.query('DELETE FROM public.projects WHERE id=$1',[projectId]);
  await page.goto(origin);await page.waitForLoadState('networkidle');await context.clearCookies();
 }
}
