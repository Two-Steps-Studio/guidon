import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=fileURLToPath(new URL("../public/",import.meta.url));
const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,"http://localhost").pathname;
  if(pathname==="/"){response.setHeader("Content-Type","text/html; charset=utf-8");response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="editor" style="width:800px;height:400px"></div></body></html>');return;}
  const file=path.resolve(root,"."+decodeURIComponent(pathname));
  if(!file.startsWith(root)){response.writeHead(403);response.end();return;}
  try{const bytes=await readFile(file);response.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":file.endsWith(".css")?"text/css":"application/octet-stream");response.end(bytes);}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({timeout:20000});
  const context=await browser.newContext();
  const page=await context.newPage();const failures=[];
  page.setDefaultTimeout(15000);
  page.on("pageerror",error=>failures.push(error.message));
  page.on("response",response=>{if(response.status()>=400)failures.push(`${response.status()} ${response.url()}`);});
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);await page.addScriptTag({url:origin+"/monaco-editor/vs/loader.js"});
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Monaco AMD loader timed out")),20000);
    globalThis.require.config({paths:{vs:"/monaco-editor/vs"}});
    globalThis.require(["vs/editor/editor.main"],monaco=>{
      globalThis.fixtureMonaco=monaco;
      globalThis.fixtureEditor=monaco.editor.create(document.getElementById("editor"),{value:'const answer: number = "wrong";',language:"typescript",automaticLayout:true});
      clearTimeout(timeout);resolve();
    },error=>{clearTimeout(timeout);reject(error);});
  }));
  let deadline;
  const diagnostics=await Promise.race([
    page.evaluate(async()=>{
      const model=globalThis.fixtureEditor.getModel();
      const factory=await globalThis.fixtureMonaco.languages.typescript.getTypeScriptWorker();
      const worker=await factory(model.uri);
      return worker.getSemanticDiagnostics(model.uri.toString());
    }),
    new Promise((_resolve,reject)=>{deadline=setTimeout(()=>reject(new Error("Monaco TypeScript worker timed out")),20000);}),
  ]).finally(()=>clearTimeout(deadline));
  assert.ok(diagnostics.length>0,"The local language worker must validate the model");
  await page.evaluate(()=>globalThis.fixtureEditor.focus());
  await page.keyboard.press(process.platform==="darwin"?"Meta+A":"Control+A");
  await page.keyboard.insertText("const answer: number = 42;");
  assert.equal(await page.evaluate(()=>globalThis.fixtureEditor.getValue()),"const answer: number = 42;");
  await page.evaluate(()=>globalThis.fixtureEditor.dispose());
  assert.deepEqual(failures,[]);
  console.log("pass patched offline Monaco AMD load, editor typing and local TypeScript worker");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
