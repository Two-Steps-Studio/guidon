// Full application E2E. Always builds a clean copy and creates its own Docker DB.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHmac, generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, cp, rm, access } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chromium,firefox,webkit,devices } from "playwright";
import { isolatedEnvironment,assertDisposablePath,allowBrowserRequest,shouldCopySource } from "./isolation.mjs";
import { seedReleaseFixture } from "./seed.mjs";
import { releaseSmoke } from "./smoke.mjs";
import { authenticationCoverage } from "./authentication.mjs";
import { seedApiFixture } from "./api-fixture.mjs";
import { apiIsolation } from "./api-isolation.mjs";
import { feedbackCoverage } from "./feedback.mjs";
import { boardLayoutCoverage } from "./board-layout.mjs";
import { agentClaimCoverage } from "./agent-claims.mjs";
import { projectModuleCoverage } from "./project-modules.mjs";
import { projectSectionCoverage } from "./project-sections.mjs";
import { marketplaceCoverage } from "./marketplace.mjs";
import { moduleAutomationCoverage } from "./module-automations.mjs";
import { taskEditingCoverage } from "./task-editing.mjs";
import { aiChatBoundaryCoverage } from "./ai-chat.mjs";
import { mobileCoverage } from "./mobile.mjs";
import { npmCommand } from "./npm-command.mjs";
import { calendarEditingCoverage } from "./calendar-editing.mjs";
import { connectedAppsCoverage } from "./profile-connected-apps.mjs";
import { onboardingCoverage } from "./onboarding.mjs";
import { forbiddenStandaloneDirectories } from "../../scripts/standalone-package.mjs";
import assert from "node:assert/strict";

const root=fileURLToPath(new URL("../../",import.meta.url));
const designAuditMode=process.argv.includes("--design-audit");
const accessibilityMode=process.argv.includes("--accessibility-audit");
const mobileMode=process.argv.includes("--mobile-audit");
const includeAccessibility=process.argv.includes("--with-accessibility");
const runId=randomBytes(6).toString("hex");
const artifacts=path.join(root,"output/e2e",runId);
await mkdir(artifacts,{recursive:true});
const directory=await mkdtemp(path.join(os.tmpdir(),"guidon-e2e-"));
await writeFile(path.join(directory,".guidon-e2e-run.json"),JSON.stringify({runId}));
const container=`guidon-e2e-${runId}`;
const environment=isolatedEnvironment(process.env,{});
// Disposable test-only signing identity; never forwarded from the operator.
environment.AGENT_AUTH_PRIVATE_KEY=JSON.stringify(generateKeyPairSync("ed25519").privateKey.export({format:"jwk"}));
environment.MODULE_SIGNING_KEY=JSON.stringify(generateKeyPairSync("ed25519").privateKey.export({format:"jwk"}));
const controller=new AbortController();
const deadline=setTimeout(()=>controller.abort(new Error("E2E global timeout")),12*60*1000);
let app,proxy,client;
let appLog="";
let phase="source-copy";
let completed=false;
const results=[];
const runNpm=(args)=>{const npm=npmCommand(args);return run(npm.command,npm.args);};

function run(command,args,options={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:directory,env:environment,windowsHide:true,signal:controller.signal,...options});
    let output="";
    child.stdout?.on("data",chunk=>{output+=chunk;});child.stderr?.on("data",chunk=>{output+=chunk;});
    child.on("error",reject);child.on("close",code=>code===0?resolve(output):reject(new Error(`${path.basename(command)} ${args[0]} failed (${code}):\n${output.slice(-6000)}`)));
  });
}
async function port(){const server=createNetServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
async function waitFor(check,label){for(let i=0;i<120;i++){controller.signal.throwIfAborted();try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error(`Timed out waiting for ${label}`);}
try{
  console.log("E2E: isolated source copy and fresh PostgreSQL container");
  const tracked=spawnSync("git",["ls-files","-co","--exclude-standard","-z"],{cwd:root,encoding:"utf8",windowsHide:true});
  if(tracked.status!==0)throw new Error("Could not inventory source files");
  for(const name of new Set(tracked.stdout.split("\0").filter(Boolean))){
    if(!shouldCopySource(name))continue;
    const target=path.resolve(directory,name);
    if(!target.startsWith(directory+path.sep))throw new Error("Source path escaped test directory");
    await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,name),target);
  }
  const dbPassword=randomBytes(18).toString("hex");
  phase="database";
  const database=`guidon_e2e_${runId}`;
  await run("docker",["run","--rm","-d","--name",container,"-e","POSTGRES_USER=guidon_e2e","-e",`POSTGRES_PASSWORD=${dbPassword}`,"-e",`POSTGRES_DB=${database}`,"-p","127.0.0.1::5432","postgres:17-alpine"]);
  const binding=JSON.parse(await run("docker",["inspect","--format",'{{json .NetworkSettings.Ports}}',container]));
  const dbPort=binding["5432/tcp"][0].HostPort;
  const connectionString=`postgresql://guidon_e2e:${dbPassword}@127.0.0.1:${dbPort}/${database}`;
  await waitFor(async()=>{const probe=new pg.Client({connectionString});try{await probe.connect();return true;}finally{await probe.end();}},"test database");
  const appPort=await port();const tlsPort=await port();const origin=`https://127.0.0.1:${tlsPort}`;
  Object.assign(environment,{DATABASE_URL:connectionString,DATABASE_POOL_MAX:"4",AUTH_SECRET:randomBytes(32).toString("hex"),STORAGE_PROVIDER:"local",STORAGE_PATH:path.join(directory,"runtime-e2e-files"),APP_URL:origin,NEXT_PUBLIC_APP_URL:origin,ADMIN_EMAILS:"alpha@guidon.example.test"});
  // Generated non-secret canaries prove that packaging excludes configuration,
  // default/custom local storage and diagnostic output, preserving the source.
  const canaries=[".env.production","storage/package-canary.txt","runtime-e2e-files/package-canary.txt","output/package-canary.txt"];
  for(const name of canaries){await mkdir(path.dirname(path.join(directory,name)),{recursive:true});await writeFile(path.join(directory,name),"GUIDON_PACKAGE_CANARY=disposable-not-a-secret\n");}
  // No inherited provider/email/billing/production secrets, no .env files.
  console.log("E2E: clean npm ci, migrations and production build");
  phase="install";
  await writeFile(path.join(artifacts,"install.log"),await runNpm(["ci","--no-audit","--no-fund"]));
  phase="migrations";
  await writeFile(path.join(artifacts,"migrations.log"),await run(process.execPath,["scripts/migrate.mjs"]));
  client=new pg.Client({connectionString});await client.connect();const fixture=await seedReleaseFixture(client);
  const api=await seedApiFixture(client,fixture);
  await client.query("INSERT INTO public.feedback(user_id,message) VALUES($1,'Legacy E2E feedback')",[fixture.users[0].id]);
  const payload=Buffer.from(JSON.stringify({sub:fixture.users[0].id,exp:Math.floor(Date.now()/1000)-60})).toString("base64url");
  const expired=`${payload}.${createHmac("sha256",environment.AUTH_SECRET).update(payload).digest("base64url")}`;
  const forgedPayload=Buffer.from(JSON.stringify({sub:fixture.users[1].id,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
  const invalidSessions=[expired,`${forgedPayload}.${expired.split(".")[1]}`,"malformed-session"];
  phase="build";
  await writeFile(path.join(artifacts,"build.log"),await runNpm(["run","build"]));
  const standalone=path.join(directory,".next/standalone");
  for(const name of [...forbiddenStandaloneDirectories,"runtime-e2e-files",".env.production",".env"]){await assert.rejects(access(path.join(standalone,name)),{code:"ENOENT"},`Forbidden artifact shipped: ${name}`);}
  for(const name of canaries)assert.equal(await readFile(path.join(directory,name),"utf8"),"GUIDON_PACKAGE_CANARY=disposable-not-a-secret\n");
  console.log("E2E: configuration/data canaries absent from standalone; source intact");
  phase="server-start";
  // Next may trace a subset of public assets into standalone. Merge the complete
  // build assets, just as a standalone deployment does, even if directories exist.
  await cp(path.join(directory,"public"),path.join(standalone,"public"),{recursive:true});
  await cp(path.join(directory,".next/static"),path.join(standalone,".next/static"),{recursive:true});
  app=spawn(process.execPath,["--require",path.join(directory,"tests/e2e/network-guard.cjs"),"server.js"],{cwd:standalone,env:{...environment,NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(appPort)},windowsHide:true,signal:controller.signal});
  app.stdout.on("data",chunk=>{appLog+=chunk;});app.stderr.on("data",chunk=>{appLog+=chunk;});app.on("error",()=>{});
  await waitFor(async()=>{const response=await fetch(`http://127.0.0.1:${appPort}/api/health`,{signal:AbortSignal.timeout(3000)});return response.ok;},"production server");
  let openssl="openssl";
  if(process.platform==="win32"){const gitOpenSsl="C:\\Program Files\\Git\\usr\\bin\\openssl.exe";try{await access(gitOpenSsl);openssl=gitOpenSsl;}catch{}}
  await run(openssl,["req","-x509","-newkey","rsa:2048","-nodes","-keyout","test.key","-out","test.crt","-days","1","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1"]);
  proxy=createHttpsServer({key:await readFile(path.join(directory,"test.key")),cert:await readFile(path.join(directory,"test.crt"))},(request,response)=>{
    const upstream=httpRequest({hostname:"127.0.0.1",port:appPort,path:request.url,method:request.method,headers:{...request.headers,"x-forwarded-proto":"https","x-forwarded-host":request.headers.host}},remote=>{response.writeHead(remote.statusCode,remote.headers);remote.pipe(response);});
    upstream.on("error",()=>{
      if(response.destroyed)return;
      if(response.headersSent){response.destroy();return;}
      response.writeHead(502);response.end();
    });
    request.on("aborted",()=>upstream.destroy());request.pipe(upstream);
  });
  await new Promise(resolve=>proxy.listen(tlsPort,"127.0.0.1",resolve));
  phase="api-mcp";
  results.push(await apiIsolation({origin,fixture,api,client}));
  for(const [name,browserType] of Object.entries({chromium,firefox,webkit})){
    phase=name;
    console.log(`E2E: ${name} real login, private projects and session smoke`);
    const browser=await browserType.launch();
    const context=await browser.newContext({...(mobileMode?{hasTouch:true,isMobile:name!=='firefox',deviceScaleFactor:2,userAgent:devices[name==='webkit'?'iPhone 13':'Pixel 7'].userAgent}:{}),ignoreHTTPSErrors:true,locale:"en-US",viewport:mobileMode?{width:375,height:812}:{width:1440,height:1000},recordVideo:{dir:path.join(artifacts,name)}});
    const blocked=[];
    await context.route("**/*",route=>allowBrowserRequest(route.request().url(),origin)?route.continue():(blocked.push(new URL(route.request().url()).origin),route.abort()));
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const started=Date.now();
    try{
      if(mobileMode){
        await mobileCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      }else if(accessibilityMode){
        const {accessibilityCoverage}=await import("./accessibility.mjs");
        await accessibilityCoverage({page,context,origin,fixture,browserName:name,artifacts});
      }else if(designAuditMode){
        const {designAudit}=await import("./design-audit.mjs");
        await designAudit({page,context,origin,fixture,browserName:name,artifacts});
      }else{
      await releaseSmoke({page,context,origin,fixture});
      await authenticationCoverage({page,context,origin,fixture,browserName:name,invalidSessions});
      await onboardingCoverage({page,context,origin,fixture,client,browserName:name});
      await agentClaimCoverage({page,context,origin,fixture,client,connectionString,browserName:name,artifacts});
      await feedbackCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      await boardLayoutCoverage({page,origin,fixture,client,browserName:name,artifacts});
      await projectModuleCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      await projectSectionCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      // Registry rules are server-side; one browser keeps the run inside its time budget.
      if(name==="chromium")await marketplaceCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      if(name==="chromium")await moduleAutomationCoverage({page,context,origin,fixture,client,browserName:name});
      await taskEditingCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      await calendarEditingCoverage({page,context,origin,fixture,client,browserName:name});
      await connectedAppsCoverage({page,context,origin,fixture,client,browserName:name});
      await aiChatBoundaryCoverage({page,context,origin,fixture,client});
      const {appleDesignCoverage}=await import("./apple-design.mjs");
      await appleDesignCoverage({page,context,origin,fixture,client,browserName:name,artifacts});
      if(includeAccessibility){
        const {accessibilityCoverage}=await import("./accessibility.mjs");
        await accessibilityCoverage({page,context,origin,fixture,browserName:name,artifacts});
      }
      assert.equal((await client.query("SELECT 1 FROM auth.users WHERE email=$1",[`weak-${name}@guidon.example.test`])).rowCount,0,"Rejected signup must not create a database user");
      assert.equal((await client.query("SELECT 1 FROM auth.users WHERE email=$1",[`signup-${name}@guidon.example.test`])).rowCount,1,"Real signup must create exactly one user");
      }
      results.push({browser:name,outcome:designAuditMode?"evidence-collected":"passed",durationMs:Date.now()-started,blockedOrigins:[...new Set(blocked)]});console.log(`${designAuditMode?"collected":"pass"} ${name}`);
    }
    catch(error){await page.screenshot({path:path.join(artifacts,`${name}-failed.png`),fullPage:true});results.push({browser:name,outcome:"failed",error:error.message,durationMs:Date.now()-started});throw error;}
    finally{await context.tracing.stop({path:path.join(artifacts,`${name}-trace.zip`)});await context.close();await browser.close();await writeFile(path.join(artifacts,"app.log"),appLog);}
  }
  for(const secret of [...Object.values(api.keys),...invalidSessions,fixture.password,environment.AUTH_SECRET,environment.AGENT_AUTH_PRIVATE_KEY,environment.MODULE_SIGNING_KEY,dbPassword])assert.equal(appLog.includes(secret),false,"Application log must not contain credentials");
  assert.equal(appLog.includes('ENVIRONMENT_FALLBACK'),false,'Server formatting must not fall back to environment-dependent dates or relative times');
  completed=true;
}finally{
  clearTimeout(deadline);
  await writeFile(path.join(artifacts,"app.log"),appLog);
  await writeFile(path.join(artifacts,"results.json"),JSON.stringify({runId,mode:mobileMode?"mobile-isolated-self-hosted":accessibilityMode?"accessibility-isolated-self-hosted":designAuditMode?"design-audit-isolated-self-hosted":"isolated-self-hosted-production-build",outcome:completed?(designAuditMode?"evidence-collected":"passed"):"failed",phase,results},null,2));
  if(proxy)await new Promise(resolve=>proxy.close(resolve));
  if(app){app.kill();await new Promise(resolve=>{app.once("exit",resolve);setTimeout(()=>{app.kill("SIGKILL");resolve();},3000).unref();});}
  await client?.end();
  // Exact unique container created by this run; no volumes or other stacks.
  spawnSync("docker",["rm","-f",container],{windowsHide:true,stdio:"ignore",timeout:15000});
  await rm(assertDisposablePath(directory),{recursive:true,force:true,maxRetries:3,retryDelay:500});
  console.log(`E2E artifacts: ${path.relative(root,artifacts)}`);
}
