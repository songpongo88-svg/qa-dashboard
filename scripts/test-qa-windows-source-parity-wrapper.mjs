import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ps=await readFile(new URL('./Check-QA-Windows-Source-Parity.ps1',import.meta.url),'utf8');
for(const must of [
 'param([switch]$Run)','OFF_NEEDS_EXPLICIT_RUN',
 'QA_PARITY_FIRESTORE_READS=0','qa-dashboard-b0b5d',
 'QA_WINDOWS_SOURCE_PARITY', 'QA_WINDOWS_SOURCE_PROBE_MANIFEST',
 'PGPASSWORD','QA_FIRESTORE_OAUTH_ACCESS_TOKEN',
 'RUN-QA-NONEXISTENT-NEVER',
 'qa-windows-private-signal-stage-commit',
 'QA_SOURCE_LISTENER=NOT_STARTED','QA_FAILOVER=OFF'
].filter(v=>v!=='RUN-QA-NONEXISTENT-NEVER'))
 assert.ok(ps.includes(must),'missing opt-in gate '+must);
assert.ok(!/Start-Process|Start-Service|firestore\.googleapis\.com|firebase\.googleapis\.com/i.test(ps));
assert.ok(ps.indexOf('if(-not $Run)')<ps.indexOf('Invoke-WebRequest'),'default must do no network');
assert.ok(ps.indexOf('New-Item -ItemType Directory')<ps.indexOf('application-default print-access-token'));
console.log('PASS offline-by-default Windows source parity wrapper policy');
