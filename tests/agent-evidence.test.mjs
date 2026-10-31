import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkAgentEvidence } from '../scripts/lib/agent-evidence.mjs';

function complete() {return {
  version:'RoG-1',projectId:'6661ef0a-81d9-490e-bdf7-f954ed4accd4',taskId:'b85538e6-3c75-4ce4-b9e9-98df317d7076',sourceRevision:'fixture-v1',
  sources:[{reference:'Guidon task fixture',version:'v1'}],status:{outcome:'succeeded',observedColumn:'ai_working',summary:'Fixture verified',handoff:'human_review'},
  acceptanceCriteria:['Regression behavior is demonstrated'],evidence:['fixture/run.json'],regression:[{command:'node --test fixture.test.mjs',result:'passed',sourceRevision:'fixture-v1',artifact:'fixture/run.json'}],
  safety:{scope:'No production writes',findings:'No findings in this fixture',evidence:['fixture/security.txt'],approvalRequired:false},rollback:{steps:['Revert fixture change'],verification:'Run fixture check'},
};}

test('complete declarations never imply verified evidence or human approval',()=>{
  const result=checkAgentEvidence(complete());assert.equal(result.valid,true);assert.equal(result.readyForHumanReview,true);assert.equal(result.evidenceVerified,false);assert.equal(result.humanApprovalVerified,false);
});
test('each missing gate blocks a green result',()=>{
  for(const [field,gate] of [['sources','G1'],['status','G2'],['evidence','G3'],['regression','G4'],['safety','G5'],['rollback','G6']]){
    const report=complete();delete report[field];const result=checkAgentEvidence(report);assert.equal(result.valid,false);assert.ok(result.issues.some(issue=>issue.gate===gate));
  }
});
test('stale, failed, missing and malformed regression evidence cannot pass',()=>{
  for(const run of [{...complete().regression[0],sourceRevision:'old'},{...complete().regression[0],result:'failed'},{...complete().regression[0],result:'not_run'},null,[]]){const report=complete();report.regression=[run];assert.equal(checkAgentEvidence(report).valid,false);}
  for(const value of [null,[],true,'text'])assert.equal(checkAgentEvidence(value).valid,false);
});
test('blocked work needs a reason, approvals need a reference, and handoff cannot request Done',()=>{
  const report=complete();report.status.outcome='blocked';assert.equal(checkAgentEvidence(report).valid,false);report.status.blocker='Original source unavailable';assert.equal(checkAgentEvidence(report).valid,true);
  report.safety.approvalRequired=true;assert.equal(checkAgentEvidence(report).valid,false);report.safety.approvalReference='Fixture human approval record';assert.equal(checkAgentEvidence(report).valid,true);
  report.status.handoff='done';assert.equal(checkAgentEvidence(report).valid,false);
});
test('the shipped template is intentionally incomplete',async()=>{assert.equal(checkAgentEvidence(JSON.parse(await readFile(new URL('../docs/templates/agent-evidence.json',import.meta.url),'utf8'))).valid,false);});
test('CLI only reads the specified report and never runs its declared command',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'guidon-evidence-'));
  try {
    const report=complete(),file=join(directory,'report.json');
    report.regression[0].command='node -e "require(\'fs\').writeFileSync(\'must-not-exist\',\'executed\')"';
    await writeFile(file,JSON.stringify(report));
    const script=fileURLToPath(new URL('../scripts/check-agent-evidence.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[script,file],{cwd:directory,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(await readdir(directory),['report.json']);assert.equal(JSON.parse(result.stdout).humanApprovalVerified,false);
    assert.equal(await readFile(file,'utf8'),JSON.stringify(report),'The input report is not rewritten');
    report.regression[0].sourceRevision='old';await writeFile(file,JSON.stringify(report));
    const incomplete=spawnSync(process.execPath,[script,file],{encoding:'utf8',windowsHide:true});assert.equal(incomplete.status,1);assert.equal(JSON.parse(incomplete.stdout).valid,false);
    await writeFile(file,'{ broken json');const bad=spawnSync(process.execPath,[script,file],{encoding:'utf8',windowsHide:true});assert.equal(bad.status,2);
    await writeFile(file,' '.repeat(256*1024+1));const big=spawnSync(process.execPath,[script,file],{encoding:'utf8',windowsHide:true});assert.equal(big.status,2);
  } finally {
    const target=resolve(directory);
    assert.equal(dirname(target),resolve(tmpdir()));
    assert.ok(basename(target).startsWith('guidon-evidence-'));
    await rm(target,{recursive:true,force:true});
  }
});
