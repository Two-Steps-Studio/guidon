import assert from 'node:assert/strict';
import path from 'node:path';

export async function searchDiagnosticsCoverage({page,origin,fixture,client,browserName,artifacts}) {
  const [owner,foreign]=fixture.users;
  const ids=[];
  const target='aabbcc12-1234-4567-89ab-123456789abc';
  const hidden='aabbcc13-1234-4567-89ab-123456789abc';
  const title='Search regression exact sentinel';
  try {
    for(const [user,id,name] of [[owner,target,title],[foreign,hidden,'PRIVATE FOREIGN SEARCH SENTINEL']]) {
      await client.query("INSERT INTO tasks(id,project_id,created_by,title,status,updated_at) VALUES($1,$2,$3,$4,'todo','2000-01-01')",[id,user.projectId,user.id,name]);ids.push(id);
    }
    for(const [count,name,date] of [[60,title+' variant ','2020-01-01'],[2005,'Unrelated fixture task ','2026-10-30']]) {
      const inserted=await client.query("INSERT INTO tasks(project_id,created_by,title,status,updated_at) SELECT $1,$2,$3||i,'todo',$4::timestamptz FROM generate_series(1,$5::integer) i RETURNING id",[owner.projectId,owner.id,name,date,count]);
      ids.push(...inserted.rows.map(row=>row.id));
    }
    await page.context().clearCookies();
    assert.equal((await page.request.post(origin+'/api/search-metrics',{headers:{origin},data:'zero'})).status(),401);
    await page.goto(origin+'/auth/login');
    await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);
    await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/dashboard');
    const metric=async(body,source=origin)=>page.request.post(origin+'/api/search-metrics',{headers:{origin:source},data:body});
    const before=Number((await client.query("SELECT count FROM search_quality_counts WHERE day=(now() AT TIME ZONE 'utc')::date AND event='zero'")).rows[0]?.count??0);
    const counted=await Promise.all(Array.from({length:6},()=>metric('zero')));
    assert.ok(counted.every(response=>response.status()===204),'Concurrent increments succeed; statuses='+counted.map(response=>response.status()).join(','));
    assert.equal(Number((await client.query("SELECT count FROM search_quality_counts WHERE day=(now() AT TIME ZONE 'utc')::date AND event='zero'")).rows[0].count),before+6);
    assert.equal((await metric('zero private')).status(),400);
    assert.equal((await metric('x'.repeat(1000))).status(),413);
    assert.equal((await metric('zero','https://foreign.example.test')).status(),403);
    assert.deepEqual((await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='search_quality_counts' AND table_schema='public' ORDER BY ordinal_position")).rows.map(row=>row.column_name),['day','event','count']);
    for (const statement of ["SELECT public.record_search_event('zero')", "SELECT * FROM public.search_quality_counts"]) {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE authenticated');
        await assert.rejects(client.query(statement),error=>error.code==='42501');
      } finally { await client.query('ROLLBACK'); }
    }
    await page.goto(origin+'/admin/search');
    await page.getByRole('heading',{name:'Search quality',exact:true}).waitFor();
    assert.equal(await page.getByRole('table').locator('tbody tr').count(),8);
        const search=async(q,project=owner.projectId)=>{
      const response=await page.request.get(origin+'/api/v1/search?'+new URLSearchParams({q,project_id:project,entity_types:'task'}));
      assert.equal(response.status(),200);assert.equal(response.headers()['cache-control'],'private, no-store');
      return response.json();
    };
    for(const q of [title,target,'aabbcc12','guidon#aabbcc12']) {
      const data=await search(q);
      assert.equal(data.results[0]?.id,target,'An old exact title/reference survives the recent and substring caps: '+q);
      assert.equal(data.diagnostics.taskCandidatesLimited,true);
      assert.deepEqual(Object.keys(data.diagnostics),['taskCandidatesLimited'],'Diagnostics contain no query, row content or identity');
    }
    assert.equal((await search(hidden)).results.length,0,'RLS hides a foreign exact ID');
    assert.equal((await search('aabbcc13',foreign.projectId)).results.length,0,'Foreign project scope cannot expose prefix matches');
    for(const q of ['   ','x'.repeat(201)]) {
      assert.equal((await page.request.get(origin+'/api/v1/search?'+new URLSearchParams({q}))).status(),400);
    }
    // No async index: a committed title change is searchable on the next request.
    await client.query("UPDATE tasks SET title='Freshly renamed sentinel' WHERE id=$1",[target]);
    assert.equal((await search('Freshly renamed sentinel')).results[0]?.id,target);
    await page.goto(`${origin}/projects/${owner.projectId}/work`);
    await page.keyboard.press('Control+k');
    const input=page.getByRole('combobox');await input.fill('No possible result qxzvjqpl');
    const dialog=page.getByRole('dialog');
    await dialog.getByText('Try a full task title or task ID, or check the selected project.',{exact:true}).waitFor();
    await dialog.getByText('For older tasks, try a more precise title or the full task ID.',{exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,browserName+'-search-empty.png')});
    await dialog.getByRole('button',{name:'Clear search',exact:true}).click();
    assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(node=>node===document.activeElement),true);
    // WebKit exposes Blob sendBeacon requests with null Playwright postData.
    // Observe the original call's Blob without changing its transport or result.
    await page.evaluate(()=>{
      window.__searchPayloads=[];
      window.__searchBeacon=navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon=(url,body)=>{
        if(String(url)==='/api/search-metrics')window.__searchPayloads.push(body.text());
        return window.__searchBeacon(url,body);
      };
    });
    const metricResponse=()=>page.waitForResponse(response=>new URL(response.url()).pathname==='/api/search-metrics' && response.status()===204);
    const resultCounted=metricResponse();
    await input.fill('Freshly renamed sentinel');
    await dialog.getByRole('option').filter({hasText:'Freshly renamed sentinel'}).waitFor();
    await resultCounted;
    const clickCounted=metricResponse();
    await input.press('Enter');await page.waitForURL(url=>url.searchParams.get('openTask')===target);
    await page.locator('#task-title').waitFor();
    await clickCounted;
    const telemetry=await page.evaluate(async()=>{const bodies=await Promise.all(window.__searchPayloads);navigator.sendBeacon=window.__searchBeacon;return bodies;});
    assert.ok(telemetry.includes('results'));assert.ok(telemetry.includes('click'));
    assert.ok(telemetry.every(body=>['results','zero','click','failed'].includes(body)));
  } finally {
    await client.query('DELETE FROM tasks WHERE id=ANY($1::uuid[])',[ids]);
  }
}
