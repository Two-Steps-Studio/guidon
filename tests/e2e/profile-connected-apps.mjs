import assert from 'node:assert/strict';

export async function connectedAppsCoverage({page,context,origin,fixture,client,browserName}){
 const owner=fixture.users[0],clientId=`e2e-profile-${browserName}`,name=`Profile OAuth ${browserName}`,foreignName=`Foreign OAuth ${browserName}`;
 const errors=[];
 const onConsole=message=>{if(message.type()==='error')errors.push(message.text());};
 const onError=error=>errors.push(error.message);
 page.on('console',onConsole);page.on('pageerror',onError);
 try{
  await client.query("INSERT INTO oauth_clients(client_id,kind,client_name,redirect_uris) VALUES($1,'dcr',$2,ARRAY['https://client.example.test/callback'])",[clientId,name]);
  await client.query("INSERT INTO oauth_grants(client_id,user_id,client_name,scopes,last_used_at) VALUES($1,$2,$3,ARRAY['tasks:read'],now()-interval '2 hours'),($1,$2,$4,ARRAY['tasks:read'],null),($1,$5,$6,ARRAY['tasks:read'],now())",[clientId,owner.id,name,`${name} unused`,fixture.users[1].id,foreignName]);
  await context.clearCookies();await page.goto(origin+'/auth/login');await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(owner.email);await page.locator('#password').fill(fixture.password);await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/dashboard');
  await page.goto(origin+'/profile');
  const app=page.getByRole('listitem').filter({has:page.getByText(name,{exact:true})});
  await app.getByText(/last used .*2 hours ago/i).waitFor();
  const unused=page.getByRole('listitem').filter({has:page.getByText(`${name} unused`,{exact:true})});await unused.waitFor();assert.equal(await unused.getByText(/last used/i).count(),0);
  assert.equal(await page.getByText(foreignName,{exact:true}).count(),0);
  await page.reload();await app.getByText(/last used .*2 hours ago/i).waitFor();await page.waitForLoadState('networkidle');
  assert.deepEqual(errors.filter(error=>/ENVIRONMENT_FALLBACK|relativeTime|hydrat|Minified React error #(418|425)/i.test(error)),[],'Profile relative time must render and hydrate without fallback errors');
 }finally{
  page.off('console',onConsole);page.off('pageerror',onError);
  await client.query('DELETE FROM oauth_clients WHERE client_id=$1',[clientId]);
  await page.goto(origin);await page.waitForLoadState('networkidle');await context.clearCookies();
 }
}
