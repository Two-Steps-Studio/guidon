import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID, createHash, generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as compiler from "../../src/lib/data-client/sql.ts";
import * as scopes from "../../src/lib/api/scopes.ts";
import * as claimCore from "../../src/lib/oauth/agent-claims-core.ts";
import * as oauthCore from "../../src/lib/oauth/oauth-core.ts";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";

const db = new PGlite();
const sql = async path => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, "SELECT 1;");
await db.exec(await sql("../../src/db/bootstrap/000_auth_compat.sql"));
for (const file of (await readdir(new URL("../../src/db/migrations/", import.meta.url))).filter(name => /^\d{3}_.*\.sql$/.test(name)).sort()) {
  await db.exec(await sql(`../../src/db/migrations/${file}`));
}
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'a@example.test'),($2,'b@example.test')", [A,B]);
await db.query("INSERT INTO public.oauth_clients(client_id,kind,client_name,redirect_uris) VALUES('claim-client','dcr','Unverified agent',ARRAY['http://127.0.0.1/callback'])");
await db.exec("SET ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
const hash = value => createHash("sha256").update(value).digest("hex");
async function registration() {
  const id = randomUUID();
  const handles = { id, claim: hash(`claim-${id}`), attempt: hash(`attempt-${id}`), code: hash("123456") };
  await db.query(`INSERT INTO public.agent_registrations(id,client_id,client_name,email_hash,claim_hash,attempt_hash,code_hash,scopes,resource,claim_expires_at,expires_at)
    VALUES($1,'claim-client','Unverified agent',$2,$3,$4,$5,ARRAY['tasks:read','project:read'],'https://guidon.test/api/mcp',now()+interval '10 minutes',now()+interval '10 minutes')`,
  [id,hash("a@example.test"),handles.claim,handles.attempt,handles.code]);
  return handles;
}
async function decide(r, { user = A, email = "a@example.test", code = "123456", allow = true } = {}) {
  return (await db.query("SELECT public.decide_agent_claim($1,$2,$3,$4,$5) AS result", [r.attempt,user,hash(email),hash(code),allow])).rows[0].result;
}
async function issue(r, { assertion = false, resource = "https://guidon.test/api/mcp" } = {}) {
  return (await db.query("SELECT public.issue_agent_claim_token($1,$2,$3,$4,$5) AS result", [assertion ? null : r.claim,assertion ? r.id : null,resource,hash(randomUUID()),"guidon_test1"])).rows[0].result;
}

// Execute the production data adapter and service with the real PostgreSQL
// compiler/queries. Only framework/session/environment edges are substituted.
const require = createRequire(import.meta.url);
async function load(file, dependencies) {
  const code = ts.transpileModule(await readFile(new URL(file, import.meta.url),"utf8"), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  const exports = {};
  vm.runInNewContext(code,{exports,Buffer,process,URL,Date,Error,console,
    require(name){ assert.ok(Object.hasOwn(dependencies,name),`Unexpected import ${name}`); return dependencies[name]; },
  });
  return exports;
}
const adapter = await load("../../src/lib/data-client/index.ts",{
  "server-only":{}, "@/lib/db/pool":{hasDirectDatabase:()=>true},
  "@/lib/db/session":{withServiceRole:fn=>fn({query:(text,values)=>db.query(text,values)})},
  "@/lib/supabase-server":{}, "./sql":compiler,
});
const apiKeys = await load("../../src/lib/api/api-keys.ts",{"server-only":{},"node:crypto":require("node:crypto"),"./scopes":scopes});
const service = await load("../../src/lib/oauth/agent-claims.ts",{
  "server-only":{},"@/lib/data-client":adapter,"@/lib/api/api-keys":apiKeys,
  "@/lib/site-url":{SITE_URL:"https://guidon.test"},"./agent-claims-core":claimCore,"./oauth-core":oauthCore,
  "./oauth":{getClient:async clientId=>({client:(await db.query("SELECT * FROM public.oauth_clients WHERE client_id=$1",[clientId])).rows[0]??null})},
});

try {
  await test("migration applies and anonymous/authenticated roles cannot read handles or execute issuance", async () => {
    for (const role of ["anon","authenticated"]) {
      await db.exec(`RESET ROLE; SET ROLE ${role}`);
      await assert.rejects(db.query("SELECT * FROM public.agent_registrations"), /permission denied/);
      await assert.rejects(db.query("SELECT public.issue_agent_claim_token(NULL,NULL,NULL,NULL,NULL)"), /permission denied/);
      await assert.rejects(db.query("SELECT * FROM public.agent_claim_events"), /permission denied/);
    }
    await db.exec("RESET ROLE; SET ROLE service_role");
  });
  await test("pending registration never issues credentials and premature polling slows down", async () => {
    const r = await registration();
    assert.equal((await issue(r)).status, "authorization_pending");
    assert.equal((await issue(r)).status, "slow_down");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.api_keys")).rows[0].n, 0);
  });
  await test("matching signed-in account and code are required; five bad codes permanently deny the request", async () => {
    const r = await registration();
    assert.equal((await decide(r,{user:B,email:"b@example.test"})).status, "invalid");
    for (let n = 0; n < 5; n++) assert.equal((await decide(r,{code:"000000"})).status, "invalid");
    assert.equal((await decide(r)).status, "invalid");
    assert.equal((await issue(r)).status, "access_denied");
  });
  await test("consent cannot be replayed and concurrent claim exchanges have one winner", async () => {
    const r = await registration();
    assert.equal((await decide(r)).status, "approved");
    assert.equal((await decide(r)).status, "invalid");
    const outcomes = await Promise.all([issue(r),issue(r)]);
    assert.deepEqual(outcomes.map(outcome => outcome.status).sort(), ["invalid_grant","issued"]);
    const stored = (await db.query(`SELECT k.user_id,k.scopes,k.human_client,k.expires_at FROM public.api_keys k
      JOIN public.agent_registrations r ON r.grant_id=k.oauth_grant_id WHERE r.id=$1`, [r.id])).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].user_id, A);
    assert.equal(stored[0].human_client, false);
    assert.deepEqual(stored[0].scopes,["tasks:read","project:read"]);
    assert.ok(Date.parse(stored[0].expires_at) <= Date.now()+3600000);
  });
  await test("resource binding, expiry and denial are enforced in locked database state", async () => {
    const denied = await registration();
    assert.equal((await decide(denied,{allow:false})).status, "denied");
    assert.equal((await issue(denied)).status,"access_denied");
    const expired = await registration();
    await db.query("UPDATE public.agent_registrations SET claim_expires_at=now()-interval '1 second',expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    assert.equal((await decide(expired)).status,"invalid");
    assert.equal((await issue(expired)).status,"expired_token");
    const r = await registration();
    await decide(r);
    assert.equal((await issue(r,{resource:"https://other.test/api/mcp"})).status,"invalid_target");
  });
  await test("verified assertion exchanges reuse the consent and stop after grant revocation", async () => {
    const r = await registration();
    await decide(r);
    assert.equal((await issue(r,{assertion:true})).status,"issued");
    await db.query("UPDATE public.oauth_grants SET revoked_at=now() WHERE id=(SELECT grant_id FROM public.agent_registrations WHERE id=$1)",[r.id]);
    assert.equal((await issue(r,{assertion:true})).status,"invalid_grant");
    const events = (await db.query("SELECT kind FROM public.agent_claim_events WHERE registration_id=$1 ORDER BY occurred_at",[r.id])).rows.map(row=>row.kind);
    assert.deepEqual(events,["started","approved","access_issued","revoked"]);
  });
  await test("production service: register, confirm session identity, exchange, refresh assertion and revoke", async () => {
    const previous = process.env.AGENT_AUTH_PRIVATE_KEY;
    process.env.AGENT_AUTH_PRIVATE_KEY=JSON.stringify(generateKeyPairSync("ed25519").privateKey.export({format:"jwk"}));
    try {
      await db.query("INSERT INTO public.oauth_clients(client_id,kind,client_name,redirect_uris) VALUES('https://signed.example/client.json','cimd','Signed client',ARRAY['https://signed.example/callback'])");
      const signedClient=await service.startAgentClaim({type:"service_auth",client_id:"https://signed.example/client.json",login_hint:"a@example.test"});
      assert.equal(signedClient.error,"invalid_client");
      const defaults=await service.startAgentClaim({type:"service_auth",client_id:"claim-client",login_hint:"a@example.test",scope:"   "});
      assert.deepEqual(Array.from(defaults.post_claim_scopes),["tasks:read","project:read"]);
      const begun = await service.startAgentClaim({type:"service_auth",client_id:"claim-client",login_hint:"a@example.test",scope:"tasks:read"});
      assert.ok(begun.registration_id);
      assert.equal(begun.access_token,undefined);
      assert.equal(begun.identity_assertion,undefined);
      const path = new URL(begun.claim.verification_uri).searchParams.get("redirect");
      const attempt = new URL(path,"https://guidon.test").searchParams.get("attempt");
      assert.ok(!begun.claim.verification_uri.includes(begun.claim.user_code));
      assert.ok(!begun.claim.verification_uri.includes(begun.claim_token));
      const row=await service.getAgentClaim(attempt);
      assert.equal(row.state,"pending");
      const params={claim_token:begun.claim_token};
      assert.equal((await service.exchangeAgentClaim(params,true)).error,"authorization_pending");
      assert.equal(await service.decideAgentClaim(attempt,{id:B,email:"b@example.test"},begun.claim.user_code,true),"invalid");
      const action=await load("../../src/app/oauth/claim/actions.ts",{
        "next/navigation":{redirect:url=>{throw Object.assign(new Error("redirect"),{url});}},
        "@/lib/data/current-user":{getCurrentUser:async()=>({id:A,email:"a@example.test"})},
        "@/lib/oauth/agent-claims":service,"@/lib/oauth/agent-claims-core":claimCore,
      });
      const form=new FormData();
      form.set("attempt",attempt);form.set("code",begun.claim.user_code);form.set("decision","allow");
      form.set("user_id",B);form.set("email","b@example.test");
      await assert.rejects(action.submitAgentClaim(form),error=>error.url?.includes("result=approved"));
      await db.query("UPDATE public.agent_registrations SET last_polled_at=now()-interval '10 seconds' WHERE id=$1",[begun.registration_id]);
      const tokens=await service.exchangeAgentClaim(params,true);
      assert.ok(tokens.access_token.startsWith("guidon_"));
      assert.equal(tokens.scope,"tasks:read");
      assert.equal(tokens.refresh_token,undefined);
      assert.equal(await claimCore.verifyAgentAssertion(tokens.identity_assertion,"https://guidon.test"),begun.registration_id);
      assert.equal((await service.exchangeAgentClaim(params,true)).error,"invalid_grant");
      const refreshed=await service.exchangeAgentClaim({assertion:tokens.identity_assertion,scope:"tasks:write"},false);
      assert.equal(refreshed.scope,"tasks:read");
      const key=(await db.query("SELECT user_id,human_client FROM public.api_keys WHERE key_hash=$1",[hash(tokens.access_token)])).rows[0];
      assert.equal(key.user_id,A);assert.equal(key.human_client,false);
      await db.query("UPDATE public.oauth_grants SET revoked_at=now() WHERE id=(SELECT grant_id FROM public.agent_registrations WHERE id=$1)",[begun.registration_id]);
      assert.equal((await service.exchangeAgentClaim({assertion:tokens.identity_assertion},false)).error,"invalid_grant");
      const unknown=await service.startAgentClaim({type:"anonymous",client_id:"claim-client",login_hint:"a@example.test"});
      assert.equal(unknown.error,"invalid_request");
    } finally {
      if(previous===undefined)delete process.env.AGENT_AUTH_PRIVATE_KEY;else process.env.AGENT_AUTH_PRIVATE_KEY=previous;
    }
  });
} finally { await db.close(); }
