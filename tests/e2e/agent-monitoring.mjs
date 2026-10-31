import assert from 'node:assert/strict';
import path from 'node:path';

export async function agentMonitoringCoverage({page,origin,fixture,client,browserName,artifacts}) {
  const [owner,foreign]=fixture.users;
  const label=`Monitor ${browserName}`;
  const ids=[];
  let approval;
  const viewport=page.viewportSize();
  try {
    for(const user of [owner,foreign])ids.push((await client.query("INSERT INTO tasks(project_id,created_by,title,status) VALUES($1,$2,$3,'review') RETURNING id",[user.projectId,user.id,`${label} ${user===owner?'visible':'foreign'}`])).rows[0].id);
    const leased=(await client.query("INSERT INTO tasks(project_id,created_by,title,status) VALUES($1,$2,$3,'ai_working') RETURNING id",[owner.projectId,owner.id,`${label} reserved`])).rows[0].id;
    ids.push(leased);
    const key=(await client.query('SELECT id FROM api_keys WHERE user_id=$1 LIMIT 1',[owner.id])).rows[0].id;
    await client.query("INSERT INTO task_claims(task_id,project_id,holder_key_id,holder_user_id,holder_label,claimed_at,expires_at) VALUES($1,$2,$3,$4,$5,now()-interval '10 minutes',now()+interval '1 hour')",[leased,owner.projectId,key,owner.id,`${label} lease`]);
    for(const outcome of ['failed','succeeded'])await client.query("INSERT INTO task_attempts(task_id,created_by,agent,problem,approach,outcome) VALUES($1,$2,$3,'Test','Read-only report',$4)",[ids[0],owner.id,label,outcome]);
    await client.query("INSERT INTO task_attempts(task_id,created_by,agent,problem,approach,outcome) VALUES($1,$2,$3,'Foreign','Excluded','failed')",[ids[1],foreign.id,`${label} secret`]);
    approval=(await client.query("INSERT INTO agent_approval_requests(project_id,task_id,action,requested_by,status) VALUES($1,$2,'complete_task',$3,'pending') RETURNING id",[owner.projectId,ids[0],owner.id])).rows[0].id;
    const before=await client.query('SELECT id,status,revision FROM tasks WHERE id=ANY($1::uuid[]) ORDER BY id',[ids]);
    await page.goto(`${origin}/projects/${owner.projectId}/activity`);
    await page.getByRole('link',{name:'Agent activity',exact:true}).click();
    const report=page.locator('[data-agent-monitoring]');
    await report.waitFor();
    const row=report.getByRole('row').filter({hasText:label});
    assert.equal(await row.count(),1);
    assert.deepEqual(await row.locator('td').allTextContents(),[label,'1','1','0','1']);
    assert.equal(await report.getByText(`${label} secret`,{exact:true}).count(),0);
    assert.ok((await report.innerText()).includes(`${label} lease`),'Live leases are visible without changing their task');
    assert.ok(await report.getByText('Token costs and separate human Review outcomes are not collected by this report. Unavailable values are not zero.',{exact:true}).count());
    await page.setViewportSize({width:375,height:812});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(artifacts,`${browserName}-agent-monitoring.png`),fullPage:true});
    assert.deepEqual((await client.query('SELECT id,status,revision FROM tasks WHERE id=ANY($1::uuid[]) ORDER BY id',[ids])).rows,before.rows,'Opening the report never changes tasks');
    const extra=await client.query("INSERT INTO tasks(project_id,created_by,title,status) SELECT $1,$2,$3||n,'todo' FROM generate_series(1,201) n RETURNING id",[owner.projectId,owner.id,`${label} cap `]);
    ids.push(...extra.rows.map(row=>row.id));
    await page.reload();
    await report.getByRole('status').filter({hasText:'The snapshot reached a data limit. Counts may be incomplete.'}).waitFor();
    await client.query('UPDATE profiles SET hide_ai=true WHERE id=$1',[owner.id]);
    await page.reload();
    assert.equal(await page.locator('[data-agent-monitoring]').count(),0,'Personal AI visibility applies to direct report URLs');
    await client.query('UPDATE profiles SET hide_ai=false WHERE id=$1',[owner.id]);
    await page.goto(`${origin}/projects/${foreign.projectId}/activity?view=agents`);
    assert.equal(await page.locator('[data-agent-monitoring]').count(),0,'An invisible project never exposes a report');
  } finally {
    await client.query('UPDATE profiles SET hide_ai=false WHERE id=$1',[owner.id]);
    if(approval)await client.query('DELETE FROM agent_approval_requests WHERE id=$1',[approval]);
    if(ids.length)await client.query('DELETE FROM tasks WHERE id=ANY($1::uuid[])',[ids]);
    if(viewport)await page.setViewportSize(viewport);
  }
}
