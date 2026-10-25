import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {npmCommand} from "./npm-command.mjs";

assert.deepEqual(npmCommand(['ci'],{platform:'linux',execPath:'/opt/hostedtoolcache/node/22/x64/bin/node',npmExecPath:null}),{command:'npm',args:['ci']});
assert.deepEqual(npmCommand(['run','build'],{platform:'darwin',execPath:'/usr/local/bin/node',npmExecPath:null}),{command:'npm',args:['run','build']});
assert.deepEqual(npmCommand(['ci'],{platform:'win32',execPath:'C:\\Program Files\\nodejs\\node.exe',npmExecPath:null}),{command:'C:\\Program Files\\nodejs\\node.exe',args:['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js','ci']});
assert.deepEqual(npmCommand(['ci'],{platform:'linux',execPath:'/node',npmExecPath:'/custom/npm-cli.js'}),{command:'/node',args:['/custom/npm-cli.js','ci']});
const args=['ci'];npmCommand(args,{platform:'linux',npmExecPath:undefined});assert.deepEqual(args,['ci']);
const real=npmCommand(['--version']);const probe=spawnSync(real.command,real.args,{encoding:'utf8',windowsHide:true,timeout:10000});
assert.equal(probe.status,0,probe.stderr??probe.error?.message);assert.match(probe.stdout.trim(),/^\d+\.\d+\.\d+/);
console.log('pass npm launch on setup-node POSIX, macOS, Windows with spaces, inherited npm entry point, immutable args and actual host npm --version');
