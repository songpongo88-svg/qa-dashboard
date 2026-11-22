// No Firestore/DB access: only checks the local Windows diagnostic contract.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('./Check-QA-Windows-Replication-Status.ps1',import.meta.url),'utf8');
for(const phrase of [
 'default_transaction_read_only=on',
 'qa_dashboard_lab',
 'source_delta_events',
 'source_delta_latest',
 'verified_source_candidates',
 'source_signals',
 'live_snapshot_rows',
 "write_frozen IS TRUE",
 'QA_WINDOWS_FIRESTORE_READS=0',
 'QA_WINDOWS_SOURCE_CONTINUITY=NOT_CERTIFIED',
 'QA_FAILOVER=OFF',
 'Read-Host',
 '-AsSecureString',
 'PGPASSWORD=$oldPassword',
 'PGOPTIONS=$oldOptions',
])assert.ok(script.includes(phrase),'missing safety requirement: '+phrase);
for(const forbidden of [
 /\bInvoke-WebRequest\b/i,
 /\bInvoke-RestMethod\b/i,
 /\bgcloud\b/i,
 /\bStart-Process\b/i,
 /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER)\s+(?:INTO\s+|TABLE\s+)?qa_(?:failover|windows_probe)_v1\./i,
 /QA_FAILOVER\s*=\s*ON/i,
 /QA_WINDOWS_SOURCE_PROBE\s*=\s*1/i,
])assert.equal(forbidden.test(script),false,'unsafe operation in read-only status script');
console.log('PASS Windows replication status checker: local read-only, private password, no Firestore or failover');
