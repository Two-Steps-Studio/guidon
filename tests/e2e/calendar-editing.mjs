import assert from "node:assert/strict";

/** Calendar must load a complete edit snapshot, not just display fields. */
export async function calendarEditingCoverage({page,context,origin,fixture,client,browserName}){
 const owner=fixture.users[0],title=`Calendar edit ${browserName}`,day=new Date().toISOString().slice(0,10);
 const task=(await client.query("INSERT INTO tasks(project_id,created_by,title,description,status,due_date,recurrence_rule,recurrence_interval) VALUES($1,$2,$3,'Original description','todo',$4::date,'weekly',2) RETURNING id",[owner.projectId,owner.id,title,day])).rows[0];
 const calendar=`${origin}/projects/${owner.projectId}/calendar?month=${day.slice(0,7)}`;
 const current=async()=>(await client.query('SELECT description,revision,recurrence_rule,recurrence_interval,is_done FROM tasks WHERE id=$1',[task.id])).rows[0];
 async function editDescription(value){
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#task-description').fill(value);
 }
 try{
  await context.clearCookies();await page.goto(origin+'/auth/login');await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/dashboard');
  await page.goto(calendar);await page.getByRole('button',{name:title,exact:true}).click();await page.locator('#task-title').waitFor();
  await editDescription('Description saved from calendar');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('#task-title').waitFor({state:'hidden'});
  assert.deepEqual(await current(),{description:'Description saved from calendar',revision:1,recurrence_rule:'weekly',recurrence_interval:2,is_done:false});
  await page.reload();await page.getByRole('button',{name:title,exact:true}).click();await page.getByText('Description saved from calendar',{exact:true}).waitFor();
  await editDescription('Unsaved stale calendar draft');
  await client.query("UPDATE tasks SET description='Concurrent edit' WHERE id=$1",[task.id]);
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('alert').filter({hasText:'This task changed or is no longer available.'}).waitFor();
  assert.equal(await page.locator('#task-description').inputValue(),'Unsaved stale calendar draft');assert.equal((await current()).revision,2);assert.equal((await current()).description,'Concurrent edit');
  await page.getByRole('dialog').filter({has:page.locator('#task-title')}).getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('dialog',{name:'Confirm action',exact:true}).getByRole('button',{name:'Discard changes',exact:true}).click();await page.locator('#task-title').waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:title,exact:true}).click();await editDescription('Saved after reloading calendar');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('#task-title').waitFor({state:'hidden'});
  assert.deepEqual(await current(),{description:'Saved after reloading calendar',revision:3,recurrence_rule:'weekly',recurrence_interval:2,is_done:false});
 }finally{
  await client.query('DELETE FROM tasks WHERE id=$1 AND project_id=$2',[task.id,owner.projectId]);
  await page.goto(origin);await page.waitForLoadState('networkidle');await context.clearCookies();
 }
}
