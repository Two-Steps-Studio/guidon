#!/usr/bin/env node
// Preserve the existing command, but build from ESM: upstream prebuilt Monaco
// embeds a vulnerable DOMPurify independently of npm overrides/lockfiles.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir,readFile,writeFile,copyFile,rm,readdir,stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const require=createRequire(import.meta.url);
const {webpack}=require("next/dist/compiled/webpack/webpack");
const monacoRoot=path.join(root,"node_modules/monaco-editor");
const purifyEsm=path.join(path.dirname(require.resolve("dompurify")),"purify.es.mjs");
const monaco=JSON.parse(await readFile(path.join(monacoRoot,"package.json"),"utf8"));
const purify=JSON.parse(await readFile(path.join(path.dirname(purifyEsm),"../package.json"),"utf8"));
const destination=path.resolve(root,"public/monaco-editor/vs");
const scratch=path.join(root,".next/monaco-build");
const metadataPath=path.join(destination,"guidon-build.json");
const next=JSON.parse(await readFile(path.join(root,"node_modules/next/package.json"),"utf8"));

async function assetHashes(){
  const files={};
  for(const file of await readdir(destination,{recursive:true})){
    const full=path.join(destination,file);
    if(file==="guidon-build.json" || !(await stat(full)).isFile())continue;
    files[file.replaceAll("\\","/")]=createHash("sha256").update(await readFile(full)).digest("hex");
  }
  return files;
}

async function main(){
  if(purify.version!=="3.4.17")throw new Error("Review the patched DOMPurify version before rebuilding Monaco");
  const fingerprint=createHash("sha256").update(monaco.version).update(purify.version).update(next.version).update(await readFile(fileURLToPath(import.meta.url))).update(await readFile(path.join(root,"scripts/monaco-css-loader.cjs"))).digest("hex");
  try{const metadata=JSON.parse(await readFile(metadataPath,"utf8"));if(metadata.fingerprint===fingerprint && JSON.stringify(metadata.files)===JSON.stringify(await assetHashes())){console.log(`Monaco assets already built with DOMPurify ${purify.version}`);return;}}catch{}
  if(!destination.startsWith(path.resolve(root,"public")+path.sep))throw new Error("Invalid Monaco build destination");
  await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});await mkdir(scratch,{recursive:true});
  const entry=path.join(scratch,"entry.mjs");
  const editorEntry=path.join(monacoRoot,"esm/vs/editor/editor.main.js").replaceAll("\\","/");
  await writeFile(entry,`import * as monaco from ${JSON.stringify(editorEntry)};\nglobalThis.MonacoEnvironment={getWorker(_id,label){const type=label==='json'?'json':label==='css'||label==='scss'||label==='less'?'css':label==='html'||label==='handlebars'||label==='razor'?'html':label==='typescript'||label==='javascript'?'typescript':'editor';return new Worker('/monaco-editor/vs/workers/'+type+'.js');}};\nObject.assign(monaco.languages,{css:monaco.css,html:monaco.html,json:monaco.json,typescript:monaco.typescript});globalThis.monaco=monaco;\nexport * from ${JSON.stringify(editorEntry)};`);
  let replacements=0;
  const shared={mode:"production",context:root,devtool:false,optimization:{minimize:false},performance:{hints:false},output:{path:destination,filename:"[name].js",publicPath:"/monaco-editor/vs/",uniqueName:"guidonMonaco"},module:{rules:[{test:/\.css$/,use:path.join(root,"scripts/monaco-css-loader.cjs")}]},plugins:[new webpack.NormalModuleReplacementPlugin(/(^|[\\/])dompurify[\\/]dompurify\.js$/,resource=>{resource.request=purifyEsm;replacements++;})]};
  const workers={editor:path.join(monacoRoot,"esm/vs/editor/editor.worker.js"),json:path.join(monacoRoot,"esm/vs/language/json/json.worker.js"),css:path.join(monacoRoot,"esm/vs/language/css/css.worker.js"),html:path.join(monacoRoot,"esm/vs/language/html/html.worker.js"),typescript:path.join(monacoRoot,"esm/vs/language/typescript/ts.worker.js")};
  const configurations=[
    {...shared,target:"web",entry:{"editor/editor.main":entry},output:{...shared.output,library:{name:"vs/editor/editor.main",type:"amd"}}},
    {...shared,target:"webworker",entry:Object.fromEntries(Object.entries(workers).map(([name,file])=>[`workers/${name}`,file])),output:{...shared.output,uniqueName:"guidonMonacoWorkers"}},
  ];
  await new Promise((resolve,reject)=>{const compiler=webpack(configurations);compiler.run((error,stats)=>compiler.close(()=>{if(error)reject(error);else if(stats.hasErrors())reject(new Error(stats.toString({all:false,errors:true})));else resolve();}));});
  if(!replacements)throw new Error("Monaco's vendored sanitizer was not replaced; refusing to publish assets");
  await copyFile(path.join(monacoRoot,"min/vs/loader.js"),path.join(destination,"loader.js"));
  await copyFile(path.join(monacoRoot,"LICENSE"),path.join(destination,"monaco-LICENSE.txt"));
  await copyFile(path.join(path.dirname(purifyEsm),"../LICENSE"),path.join(destination,"dompurify-LICENSE.txt"));
  await writeFile(metadataPath,JSON.stringify({monaco:monaco.version,dompurify:purify.version,fingerprint,source:"esm-with-patched-sanitizer",workers:Object.keys(workers),files:await assetHashes()},null,2));
  console.log(`Built Monaco ${monaco.version} with patched DOMPurify ${purify.version}`);
}
main().catch(async error=>{await rm(metadataPath,{force:true});console.error(`Monaco build failed: ${error.message}`);process.exitCode=1;});
