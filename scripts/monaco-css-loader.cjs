// Webpack's loader interface is CommonJS; this handles trusted Monaco CSS only.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

module.exports = function(source) {
  const root=path.resolve(this.rootContext,"node_modules/monaco-editor/esm");
  const css=source.replace(/url\(\s*(["']?)(.*?)\1\s*\)/g,(_match,_quote,url)=>{
    if(url.startsWith("data:") || url.startsWith("#"))return `url(${JSON.stringify(url)})`;
    const asset=path.resolve(path.dirname(this.resourcePath),url);
    if(!asset.startsWith(root+path.sep))throw new Error("Monaco CSS asset escaped its package");
    const bytes=fs.readFileSync(asset);
    const filename=`assets/${createHash("sha256").update(bytes).digest("hex").slice(0,16)}${path.extname(asset)}`;
    this.emitFile(filename,bytes);
    return `url("/monaco-editor/vs/${filename}")`;
  });
  return `if(typeof document!=='undefined'){const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);}`;
};
