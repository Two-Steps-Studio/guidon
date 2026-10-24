// Real editor, hook and preview; fixture adapters replace auth/AI/storage.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require=createRequire(import.meta.url);
const {webpack}=require("next/dist/compiled/webpack/webpack");
const {NormalModuleReplacementPlugin}=webpack;
const root=fileURLToPath(new URL("../",import.meta.url));
const output=path.join(root,"output/playwright/module-editor-fixture");
await mkdir(output,{recursive:true});
const adapter=path.join(root,"tests/fixtures/module-editor-adapters.tsx");
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:"development",target:"web",devtool:false,entry:path.join(root,"tests/fixtures/module-editor-entry.tsx"),output:{path:output,filename:"editor.js"},resolve:{extensions:[".tsx",".ts",".js"],alias:{"@":path.join(root,"src"),"next/link$":adapter,"next/navigation$":adapter,"next-intl$":adapter}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(root,"tests/fixtures/module-editor-loader.cjs")}]},plugins:[new NormalModuleReplacementPlugin(/^\.\/(builder-actions|draft-actions|package-actions)$/,resource=>{resource.request=adapter;})]});
  compiler.run((error,stats)=>compiler.close(()=>{if(error)reject(error);else if(stats.hasErrors())reject(new Error(stats.toString({all:false,errors:true})));else resolve();}));
});
const bundle=await readFile(path.join(output,"editor.js"));
const cssRoot=path.join(root,".next/static");
const cssFiles=(await readdir(cssRoot,{recursive:true})).filter(name=>name.endsWith(".css"));
assert.ok(cssFiles.length,"Run npm run build before browser tests");
const css=(await Promise.all(cssFiles.map(file=>readFile(path.join(cssRoot,file),"utf8")))).join("\n");
let saved={revision:0,state:{version:1,past:[],present:{prompt:"",plan:null,manifest:null},future:[]}};
let writes=0;
let nextDelay=0;
const server=createServer(async(request,response)=>{
  if(request.url==="/slow"){nextDelay=1200;response.end("ok");return;}
  if(request.url==="/editor.js"){response.writeHead(200,{"Content-Type":"text/javascript"});response.end(bundle);return;}
  if(request.url==="/save"){
    let body="";for await(const chunk of request)body+=chunk;
    const input=JSON.parse(body);
    const conflict=input.revision!==saved.revision;
    if(!conflict){saved={state:input.state,revision:input.revision+1};writes++;}
    const result=conflict?{error:"conflict"}:{error:null,revision:saved.revision};
    const delay=nextDelay;nextDelay=0;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    response.writeHead(200,{"Content-Type":"application/json"});response.end(JSON.stringify(result));return;
  }
  response.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root" style="padding:16px"></div><script id="initial" type="application/json">${JSON.stringify(saved).replaceAll("<","\\u003c")}</script><script src="/editor.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(8000);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(url);
  await page.getByText("AI module builder",{exact:true}).waitFor();
  assert.equal(await page.getByRole("tabpanel").count(),3);
  for(const panel of await page.getByRole("tabpanel").all()) assert.ok(await panel.isVisible());
  const panels=page.getByRole("tabpanel");
  const before=await panels.nth(0).boundingBox();
  await page.getByLabel("Chat width",{exact:true}).focus();await page.keyboard.press("End");
  const after=await panels.nth(0).boundingBox();assert.ok(after.width>before.width);
  await page.getByLabel("What should the module do?").fill("Plan releases");
  await page.getByRole("button",{name:"Propose a plan",exact:true}).click();
  await page.getByRole("checkbox",{name:"I approve this plan and its permissions to create a manifest."}).check();
  await page.getByRole("button",{name:"Create manifest",exact:true}).click();
  await page.getByLabel("Module manifest (JSON)").waitFor();
  assert.ok(await page.getByRole("button",{name:"Publish — coming soon"}).isDisabled());
  await page.getByRole("button",{name:"Undo",exact:true}).click();assert.equal(await page.getByLabel("Module manifest (JSON)").count(),0);
  await page.getByRole("button",{name:"Redo",exact:true}).click();await page.getByLabel("Module manifest (JSON)").waitFor();
  assert.equal(await page.getByRole("checkbox",{name:"I approve these permissions for this project."}).isChecked(),false);
  await page.getByText("Draft saved",{exact:true}).waitFor();assert.ok(writes>0);
  await page.reload();await page.getByLabel("Module manifest (JSON)").waitFor();
  assert.equal(await page.getByLabel("What should the module do?").inputValue(),"Plan releases");
  assert.equal(await page.getByRole("checkbox",{name:"I approve these permissions for this project."}).isChecked(),false);
  for(const width of [375,768]){
    await page.setViewportSize({width,height:900});
    await page.getByRole("tab",{name:"Chat",exact:true}).click();
    assert.equal(await page.locator('[role="tabpanel"]:visible').count(),1);
    await page.getByRole("tab",{name:"Chat",exact:true}).press("ArrowRight");
    assert.equal(await page.getByRole("tab",{name:"Preview",exact:true}).getAttribute("aria-selected"),"true");
    assert.ok(await page.getByLabel("View",{exact:true}).isVisible());
    await page.getByLabel("View",{exact:true}).selectOption({label:"New release"});
    assert.equal(await page.locator('[role="tabpanel"]:visible input:not([type="hidden"])').count()>0,true);
    for(const input of await page.locator('[role="tabpanel"]:visible input').all())assert.ok(await input.isDisabled());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:375,height:900});
  await page.screenshot({path:path.join(output,"mobile.png"),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.request.get(`${url}/slow`);
  await page.getByLabel("What should the module do?").fill("First in-flight save");
  await page.getByText("Saving draft…",{exact:true}).waitFor();
  await page.getByLabel("What should the module do?").fill("Later edit while saving");
  await page.getByText("Draft saved",{exact:true}).waitFor();
  assert.equal(saved.state.present.prompt,"Later edit while saving");
  const second=await browser.newPage({viewport:{width:1440,height:1000}});await second.goto(url);
  await second.getByLabel("What should the module do?").waitFor();
  await page.getByLabel("What should the module do?").fill("Newer first-tab edit");
  await page.getByText("Draft saved",{exact:true}).waitFor();
  await second.getByLabel("What should the module do?").fill("Keep this local conflict");
  await second.getByText("A newer draft exists in another tab. Saving stopped.",{exact:true}).waitFor();
  assert.equal(saved.state.present.prompt,"Newer first-tab edit");
  assert.equal(await second.getByLabel("What should the module do?").inputValue(),"Keep this local conflict");
  assert.ok(await second.getByRole("button",{name:"Download draft backup"}).isVisible());
  assert.deepEqual(errors,[]);
  console.log("pass actual editor: desktop panels/resize, 375/768px tabs/keyboard/no overflow, preview form isolation, autosave/reload, undo/redo, fresh consent and two-tab conflict preservation");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
