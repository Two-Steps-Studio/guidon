#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { checkAgentEvidence } from './lib/agent-evidence.mjs';

// No API, network, shell, evidence-file execution or board writes.
try {
  if(process.argv.length!==3)throw new Error('Usage: node scripts/check-agent-evidence.mjs <report.json>');
  const file=process.argv[2];
  const info=await stat(file);
  if(!info.isFile()||info.size>256*1024)throw new Error('Report must be a regular JSON file of at most 256 KiB');
  const result=checkAgentEvidence(JSON.parse(await readFile(file,'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=result.valid?0:1;
} catch(error) {
  process.stderr.write((error instanceof SyntaxError?'Invalid JSON report':error.message)+'\n');
  process.exitCode=2;
}
