import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const body=await readFile(new URL('./Check-QA-Windows-Firestore-Metadata.ps1',import.meta.url),'utf8');
for(const must of [
 'qa-dashboard-b0b5d','asia-southeast1','databases/(default)',
 'auth application-default print-access-token','Invoke-RestMethod -Method Get',
 'DATABASE_METADATA_ACCESS_VERIFIED','METADATA_PERMISSION_DENIED',
 'QA_WINDOWS_FIRESTORE_DOCUMENT_ACCESS=NOT_VERIFIED',
 'QA_WINDOWS_FIRESTORE_DOCUMENT_READS=0',
 'QA_WINDOWS_FIRESTORE_QUOTA=NOT_VERIFIED',
 'QA_WINDOWS_FIRESTORE_LISTENER=NOT_STARTED','QA_FAILOVER=OFF'
])assert.ok(body.includes(must),'Missing guard: '+must);
assert.equal(/\/documents[/?]|Invoke-RestMethod\s+-Method\s+(?:Post|Patch|Delete|Put)|Start-Process|Start-Service|pg_dump|psql|Add-Iam/i.test(body),false);
assert.equal(/Write-(?:Output|Host)\s+\$token\b/i.test(body),false);
console.log('PASS Firestore metadata-only ADC probe policy; zero document reads and no token output');
