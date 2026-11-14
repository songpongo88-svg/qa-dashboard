import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('./Create-QA-Windows-Reconciliation-Snapshot.ps1',
 import.meta.url),'utf8');
for(const x of [
 'param([switch]$Run)','OFF_EXPLICIT_RUN_REQUIRED',
 'ALREADY_SCANNED_TODAY_OR_FAILOVER_NOT_OFF',
 'DB_BACKUP=CREATED','snapshot-db-backups',
 'QA_WINDOWS_RECONCILE_RUN','QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE',
 'QA_WINDOWS_RECONCILE_REVIEW','QA_WINDOWS_SOURCE_PROBE_MANIFEST',
 'qa-dashboard-b0b5d','application-default print-access-token',
 'QA_SOURCE_LISTENER=NOT_STARTED','QA_FAILOVER=OFF',
 'NEW_SNAPSHOT_CREATED_AND_VERIFIED_NOT_ACTIVE',
 'Run-QA-Windows-Reconciliation.mjs',
 '0a0961c4b0eba03336a2f4aa04c0195b05ec06f3'
])assert.ok(script.includes(x),'missing safety policy: '+x);
assert.ok(script.indexOf('if(-not $Run)')<
 script.indexOf('Invoke-WebRequest'),'default must be zero-network');
assert.ok(script.indexOf('ALREADY_SCANNED_TODAY_OR_FAILOVER_NOT_OFF')<
 script.indexOf('Invoke-WebRequest'),'same-day scan block before network');
assert.ok(script.indexOf('DB_BACKUP=CREATED')<
 script.indexOf('QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$token'),
 'local database backup must precede Firestore token injection');
assert.ok(!/Start-Process|Start-Service|pg_restore|QA_FAILOVER=ON|firestore\.googleapis\.com/i.test(script));
assert.ok(!/Write-(?:Host|Output)\s+\$token\b/i.test(script));
console.log('PASS manual candidate snapshot wrapper: no reads by default, UTC scan guard, database backup, no failover');
