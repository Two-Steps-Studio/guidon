import path from "node:path";

/** Preserve npm's own entry point; direct node invocations differ by OS. */
export function npmCommand(args, {platform=process.platform,execPath=process.execPath,npmExecPath=process.env.npm_execpath}={}) {
  if(npmExecPath)return {command:execPath,args:[npmExecPath,...args]};
  if(platform==='win32')return {command:execPath,args:[path.win32.join(path.win32.dirname(execPath),'node_modules','npm','bin','npm-cli.js'),...args]};
  // On POSIX the npm executable/symlink on PATH resolves the installed prefix;
  // it is not inside <node-prefix>/bin/node_modules (GitHub setup-node).
  return {command:'npm',args:[...args]};
}
