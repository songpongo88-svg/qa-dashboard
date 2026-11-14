import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('./Check-QA-Windows-Private-Stage.ps1',import.meta.url),'utf8');
for(const literal of [
 'b4edc5101285d3e85ccafaba9a076c3553756879',
 'bc82bc5441107b3bf469dfb3dc7fd473548fe9e2',
 'READ_ONLY_LOCAL_ACCEPTANCE_COMPLETE',
 'BASELINE_OR_SCHEMA_REQUIRES_REVIEW',
 'STAGED_MODULES_MISSING',
 'QA_WINDOWS_STAGE_FIRESTORE_READS=0',
 'QA_FAILOVER=OFF',
 'Existing local PostgreSQL postgres password',
 'QA_WINDOWS_STAGE_ACCEPTANCE',
 'QA_WINDOWS_SOURCE_PROBE_MANIFEST',
 'PGPASSWORD',
 'Remove-Item -LiteralPath $tempScript',
])assert.ok(src.includes(literal),'missing safe check: '+literal);
assert.ok(!/\bStart-Process\b|\bStart-Service\b|\bpg_dump\b|\bpg_restore\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b/i.test(src),
 'acceptance wrapper must not start listeners or alter databases');
console.log('PASS read-only Windows stage acceptance wrapper policy');
