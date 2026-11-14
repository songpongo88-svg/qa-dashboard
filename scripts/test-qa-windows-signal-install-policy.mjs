// This installer MUST remain manual, fail-closed, offline by default.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('./Install-QA-Windows-Private-Signal-Stage.ps1',
 import.meta.url),'utf8');
for(const required of [
  'param([switch]$Apply)',
  'READY_FOR_EXPLICIT_INACTIVE_INSTALL',
  'FROZEN_SNAPSHOT_VERIFIED',
  'LOCAL_DATABASE_BACKUP_CREATED',
  'PRIVATE_METADATA_STAGE_INSTALLED_INACTIVE',
  'QA_SOURCE_LISTENER=NOT_STARTED',
  'QA_FAILOVER=OFF',
  'QA_FIRESTORE_READS=0',
  "mode='disabled'",
  'source_snapshot_verified IS FALSE',
  'source_delta_events',
  'source_delta_latest',
  'snapshot-db-backups',
  'qa_windows_probe_v1.source_signals',
  'b4edc5101285d3e85ccafaba9a076c3553756879',
])assert.ok(src.includes(required),'missing gate '+required);
assert.equal(/\bStart-Process\b|\bStart-Service\b|QA_FAILOVER=ON|firebase\.googleapis\.com|firestore\.googleapis\.com/i.test(src),false);
assert.ok(src.indexOf('if(-not $Apply)') < src.indexOf('Invoke-WebRequest'),
 'default path must return before any download');
assert.ok(src.indexOf('LOCAL_DATABASE_BACKUP_CREATED') < src.indexOf(' -f $sourceSql'),
 'backup must precede SQL migration');
console.log('PASS Windows stage installer: manual apply, pinned files, backup, frozen gate, no background activation');
