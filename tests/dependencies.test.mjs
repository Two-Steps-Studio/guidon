import assert from "node:assert/strict";
import {readFile,readdir,access} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const pkg=JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));
const expected={next:"16.4.3","@next/third-parties":"16.4.3","@modelcontextprotocol/sdk":"1.32.2",sharp:"0.35.5",zod:"4.6.7",dompurify:"3.4.17","monaco-editor":"0.57.0"};
for(const [name,version] of Object.entries(expected)){
  assert.equal(pkg.dependencies[name],version,`${name} must keep its reviewed exact version`);
  const installed=JSON.parse(await readFile(path.join(root,"node_modules",name,"package.json"),"utf8"));
  assert.equal(installed.version,version,`${name} installed version differs from reviewed dependency`);
}
assert.equal(pkg.devDependencies["eslint-config-next"],expected.next);
const assets=path.join(root,"public/monaco-editor/vs");
const metadata=JSON.parse(await readFile(path.join(assets,"guidon-build.json"),"utf8"));
assert.equal(metadata.dompurify,expected.dompurify);assert.equal(metadata.monaco,expected["monaco-editor"]);
assert.equal(metadata.source,"esm-with-patched-sanitizer");
for(const worker of ["editor","typescript","json","css","html"])await access(path.join(assets,`workers/${worker}.js`));
let found=false;
for(const file of (await readdir(assets,{recursive:true})).filter(name=>name.endsWith(".js"))){
  const content=await readFile(path.join(assets,file),"utf8");
  for(const match of content.matchAll(/DOMPurify (\d+\.\d+\.\d+)/g)){assert.equal(match[1],expected.dompurify,`Old vendored sanitizer shipped in ${file}`);found=true;}
}
assert.ok(found,"Generated browser assets must contain the actual patched sanitizer");
console.log("pass reviewed runtime versions and shipped Monaco sanitizer/worker assets");
