// In-memory policy tests: zero Firestore, local Windows or PostgreSQL access.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyQaWindowsCandidateArchive}
 from './Verify-QA-Windows-Candidate-Archive.mjs';
const env={QA_WINDOWS_CANDIDATE_VERIFY:'1',
 QA_WINDOWS_RECONCILE_REVIEW:'1',QA_FAILOVER:'OFF'};
let queries=0,version=170011,candidate='qa-new-20261120-verified';
const pool={
 connect(){return{}},
 async query(sql){
  queries++;
  if(sql.includes("current_setting('server_version_num')"))
   return{rows:[{db:'qa_dashboard_lab',version,recovering:false}]};
  if(sql.includes('FROM qa_failover_v1.live_snapshot_batches'))
   return{rows:candidate?[{snapshot_id:candidate}]:[]};
  throw Error('Unexpected local query');
 },
};
const good={datasets:11,localCopyVerified:true,
 sourceContinuityVerified:false,sourceFreshnessAfterCandidate:false,
 failoverReady:false,baselineDocuments:2226,candidateDocuments:2427,
 added:202,removed:1,modified:61,unchanged:2164,changedDatasets:11};
await assert.rejects(verifyQaWindowsCandidateArchive({
 pool,env:{...env,QA_FAILOVER:'ON'},inspect:async()=>good}),
 /qa_candidate_local_verify_disabled/);
assert.equal(queries,0);
version=160004;
await assert.rejects(verifyQaWindowsCandidateArchive({
 pool,env,inspect:async()=>good}),/qa_candidate_local_pg17_required/);
version=170011;candidate=null;
await assert.rejects(verifyQaWindowsCandidateArchive({
 pool,env,inspect:async()=>good}),/qa_candidate_no_local_copy_found/);
candidate='qa-new-20261120-verified';
await assert.rejects(verifyQaWindowsCandidateArchive({
 pool,env,inspect:async()=>({...good,failoverReady:true})}),
 /qa_candidate_local_review_failed/);
await assert.rejects(verifyQaWindowsCandidateArchive({
 pool,env,inspect:async()=>({...good,added:203})}),
 /qa_candidate_local_review_failed/);
const ok=await verifyQaWindowsCandidateArchive({pool,env,inspect:async args=>{
 assert.equal(args.candidateSnapshotId,candidate);
 assert.equal(args.env.QA_FAILOVER,'OFF');
 return good;
}});
assert.equal(ok.status,'LOCAL_CANDIDATE_HASHES_AND_MANIFESTS_RECHECKED');
assert.deepEqual([ok.oldDocuments,ok.newDocuments,ok.added,ok.removed,ok.modified,ok.unchanged],
 [2226,2427,202,1,61,2164]);
const ps=await readFile(new URL('./Check-QA-Windows-New-Candidate.ps1',import.meta.url),'utf8');
for(const text of [
 'QA_FAILOVER=OFF','QA_WINDOWS_ARCHIVE_FIRESTORE_READS=0',
 'QA_SOURCE_LISTENER=NOT_STARTED_BY_CHECK',
 'Invoke-WebRequest','Read-Host','-AsSecureString',
 'PGPASSWORD=$oldPassword','QA_WINDOWS_RECONCILE_REVIEW',
 'QA_WINDOWS_CANDIDATE_VERIFY',
 '7ad64d38c11e9ba3a193b3a13049ce2a9fd01656',
])assert.ok(ps.includes(text),'missing Windows recheck contract: '+text);
for(const forbidden of [
 /\bgcloud\b/i,/\bInvoke-RestMethod\b/i, /\bStart-Process\b/i,
 /\b(pg_restore|pg_dump|psql|firebase)\b/i,
 /QA_FAILOVER\s*=\s*ON/i,
])assert.equal(forbidden.test(ps),false,'unexpected write/cloud operation');
console.log('PASS local new candidate checker: 11 manifests gate, read-only review, no Firestore, no failover');
