import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ps=await readFile(new URL('./Check-QA-Windows-Firestore-OneRead.ps1',import.meta.url),'utf8');
for(const text of [
 'qa-dashboard-b0b5d','QA_WINDOWS_FIRESTORE_ONE_READ=',
 'DOCUMENT_LIST_API_ACCESS_VERIFIED','DOCUMENT_READ_QUOTA_LIMITED',
 'qa_failover_v1.source_read_budget_daily',
 '[IO.FileMode]::CreateNew','reserved_document_units+1<=3000',
 'reserved_requests+1<=80', 'pageSize=1','mask.fieldPaths=',
 'QA_WINDOWS_FIRESTORE_READ_RESERVATION=1',
 'QA_WINDOWS_FIRESTORE_OTHER_USAGE=UNKNOWN',
 'QA_WINDOWS_FIRESTORE_LISTENER=NOT_STARTED',
 'QA_FAILOVER=OFF'
])assert.ok(ps.includes(text),'missing hard gate '+text);
assert.equal((ps.match(/Invoke-RestMethod -Method Get/g)||[]).length,1);
assert.ok(!/Start-Process|Start-Service|Invoke-RestMethod -Method (Post|Patch|Put|Delete)|Write-(Output|Host)\s+\$token/i.test(ps));
assert.ok(ps.indexOf('CreateNew')<ps.indexOf('$reserveSql=@')&&
 ps.indexOf("'RESERVED'")<ps.indexOf('$response=Invoke-RestMethod'));
console.log('PASS single page Firestore probe: exclusive day guard, durable budget, one GET, no response data printed');
