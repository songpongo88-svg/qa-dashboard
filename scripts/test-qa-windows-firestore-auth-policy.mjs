import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const s=await readFile(new URL('./Check-QA-Windows-Firestore-Auth.ps1',import.meta.url),'utf8');
for(const value of [
 'qa-dashboard-b0b5d','auth application-default print-access-token',
 'ADC_TOKEN_READY_NO_FIRESTORE_READS',
 'QA_WINDOWS_FIRESTORE_PERMISSIONS=NOT_VERIFIED',
 'QA_WINDOWS_FIRESTORE_QUOTA=NOT_VERIFIED',
 'QA_WINDOWS_FIRESTORE_READS=0',
 'QA_WINDOWS_FIRESTORE_LISTENER=NOT_STARTED','QA_FAILOVER=OFF',
 'GOOGLE_APPLICATION_CREDENTIALS','CLOUDSDK_CORE_DISABLE_PROMPTS',
])assert.ok(s.includes(value),'Missing safeguard '+value);
assert.ok(!/Invoke-WebRequest|Invoke-RestMethod|Start-Process|Start-Service|pg_dump|pg_restore|psql|firestore\.googleapis\.com|firebase\.googleapis\.com/i.test(s));
assert.ok(!/Write-(Output|Host)\s+\$token\b/i.test(s),'Never print OAuth token');
console.log('PASS ADC local authentication preflight policy (no Firestore)');
