import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import pg from "pg";

async function concurrentRevocation({client,connectionString,client_id,owner,origin}) {
  const hash=value=>createHash("sha256").update(value).digest("hex");
  const grant=(await client.query("INSERT INTO public.oauth_grants(client_id,user_id,client_name,scopes,resource) VALUES($1,$2,'E2E concurrency',ARRAY['tasks:read'],$3) RETURNING id",[client_id,owner.id,`${origin}/api/mcp`])).rows[0];
  const registration=(await client.query(`INSERT INTO public.agent_registrations(client_id,client_name,email_hash,claim_hash,attempt_hash,code_hash,scopes,resource,state,grant_id,claim_expires_at,expires_at)
    VALUES($1,'E2E concurrency',$2,$3,$4,$5,ARRAY['tasks:read'],$6,'approved',$7,now()+interval '10 minutes',now()+interval '1 day') RETURNING id`,
  [client_id,hash(owner.email),hash(randomUUID()),hash(randomUUID()),hash("123456"),`${origin}/api/mcp`,grant.id])).rows[0];
  const issuer=new pg.Client({connectionString});
  let revoking=false;
  try {
    await issuer.connect();
    const pid=(await issuer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await issuer.query("BEGIN; SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    await client.query("BEGIN; SET LOCAL statement_timeout='5s'");revoking=true;
    await client.query("SELECT id FROM public.oauth_grants WHERE id=$1 FOR UPDATE",[grant.id]);
    const issuance=issuer.query("SELECT public.issue_agent_claim_token(NULL,$1,$2,$3,'guidon_race1') AS result",[registration.id,`${origin}/api/mcp`,hash(randomUUID())])
      .then(value=>({value}),error=>({error}));
    let blocked=false;
    for(let n=0;n<50;n++){
      await client.query("SELECT pg_stat_clear_snapshot()");
      blocked=(await client.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked;
      if(blocked)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(blocked,"Issuer must reach the row lock before revocation proceeds");
    // Revocation's audit FK takes KEY SHARE on the registration. Issuance's
    // NO KEY UPDATE is compatible, avoiding an inverse lock-order deadlock.
    await client.query("UPDATE public.oauth_grants SET revoked_at=now() WHERE id=$1",[grant.id]);
    await client.query("COMMIT");revoking=false;
    const result=await issuance;assert.ifError(result.error);
    assert.equal(result.value.rows[0].result.status,"invalid_grant");
    await issuer.query("COMMIT");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM public.api_keys WHERE oauth_grant_id=$1",[grant.id])).rows[0].n,0);
  } finally {
    if(revoking)await client.query("ROLLBACK");
    await issuer.query("ROLLBACK").catch(()=>{});await issuer.end();
    await client.query("DELETE FROM public.oauth_grants WHERE id=$1",[grant.id]);
  }
}

export async function agentClaimCoverage({page,context,origin,fixture,client,connectionString,browserName,artifacts}) {
  const [owner,foreign]=fixture.users;
  const label=`E2E ${browserName} approval`;
  const registered=await context.request.post(`${origin}/oauth/register`,{data:{client_name:label,redirect_uris:["http://127.0.0.1/callback"]}});
  assert.equal(registered.status(),201);
  const {client_id}=await registered.json();
  if(browserName==="chromium")await concurrentRevocation({client,connectionString,client_id,owner,origin});
  const begin=async()=>{
    const response=await context.request.post(`${origin}/oauth/agent/identity`,{data:{type:"service_auth",client_id,login_hint:owner.email,scope:"tasks:read",resource:`${origin}/api/mcp`}});
    assert.equal(response.status(),200);
    const value=await response.json();
    assert.equal(value.access_token,undefined);
    assert.equal(value.identity_assertion,undefined);
    return value;
  };
  const login=async(request,email)=>{
    await context.clearCookies();
    await page.goto(request.claim.verification_uri);
    await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url=>url.pathname==="/oauth/claim");
    await page.getByRole("heading",{level:1,name:"Approve an agent",exact:true}).waitFor();
  };
  const exchange=async(fields)=>context.request.post(`${origin}/oauth/token`,{form:{resource:`${origin}/api/mcp`,...fields}});
  const request=await begin();
  const pending=await exchange({grant_type:"urn:workos:agent-auth:grant-type:claim",claim_token:request.claim_token});
  assert.equal((await pending.json()).error,"authorization_pending");
  const pendingAt=Date.now();
  await login(request,foreign.email);
  await page.getByRole("alert").filter({hasText:"different account"}).waitFor();
  assert.equal(await page.locator("#code").count(),0);
  await login(request,owner.email);
  await page.getByText(`Requesting app: ${label}`,{exact:true}).waitFor();
  assert.equal(await page.locator('input[name="code"]').inputValue(),"");
  await page.locator("#code").fill(request.claim.user_code);
  await page.getByRole("button",{name:"Allow",exact:true}).click();
  await page.getByRole("status").filter({hasText:"Approved. Return to your agent"}).waitFor();
  const waitMs=Math.max(0,5000-(Date.now()-pendingAt));
  if(waitMs)await new Promise(resolve=>setTimeout(resolve,waitMs+20));
  const response=await exchange({grant_type:"urn:workos:agent-auth:grant-type:claim",claim_token:request.claim_token});
  assert.equal(response.status(),200);
  const tokens=await response.json();
  assert.equal(tokens.scope,"tasks:read");
  assert.equal(tokens.refresh_token,undefined);
  assert.ok(tokens.identity_assertion);
  const headers={Authorization:`Bearer ${tokens.access_token}`};
  const projects=await context.request.get(`${origin}/api/v1/projects`,{headers});
  assert.equal(projects.status(),200);
  const text=await projects.text();
  assert.ok(text.includes(owner.projectName));assert.ok(!text.includes(foreign.projectName));
  const foreignResponse=await context.request.get(`${origin}/api/v1/projects/${foreign.projectId}`,{headers});
  assert.ok([403,404].includes(foreignResponse.status()));
  const write=await context.request.post(`${origin}/api/v1/projects/${owner.projectId}/tasks`,{headers,data:{title:"Must not create with read-only approval"}});
  assert.equal(write.status(),403);
  const replay=await exchange({grant_type:"urn:workos:agent-auth:grant-type:claim",claim_token:request.claim_token});
  assert.equal((await replay.json()).error,"invalid_grant");
  const refresh=await exchange({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:tokens.identity_assertion});
  assert.equal(refresh.status(),200);
  await page.goto(`${origin}/profile`);
  const row=page.locator("li").filter({has:page.getByText(label,{exact:true})});
  await row.getByRole("button",{name:"Disconnect",exact:true}).click();
  await row.waitFor({state:"detached"});
  assert.equal((await context.request.get(`${origin}/api/v1/projects`,{headers})).status(),401);
  const revoked=await exchange({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:tokens.identity_assertion});
  assert.equal((await revoked.json()).error,"invalid_grant");
  const denied=await begin();
  // Already signed in: go directly to the claim destination, preserving the
  // separate handoff code. Cancel does not require filling the code.
  await page.goto(origin+new URL(denied.claim.verification_uri).searchParams.get("redirect"));
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("status").filter({hasText:"Access denied"}).waitFor();
  const denial=await exchange({grant_type:"urn:workos:agent-auth:grant-type:claim",claim_token:denied.claim_token});
  assert.equal((await denial.json()).error,"access_denied");
  const events=(await client.query("SELECT kind FROM public.agent_claim_events WHERE registration_id=$1",[request.registration_id])).rows;
  assert.ok(events.some(event=>event.kind==="revoked"));
  await page.screenshot({path:`${artifacts}/${browserName}-agent-claim.png`,fullPage:true});
  await context.clearCookies();
}
