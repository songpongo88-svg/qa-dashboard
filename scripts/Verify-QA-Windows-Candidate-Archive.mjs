// Read-only local recheck of the latest independently archived Windows QA
// snapshot. No Firestore, listener, cloud services, writes, or failover.
import {pathToFileURL} from 'node:url';
import {inspectQaWindowsReconciliation}
 from '../server/qaWindowsReconciliationReview.js';
const bad=code=>{throw Object.assign(new Error(code),{code});};
const ID=/^[A-Za-z0-9_.:-]{12,128}$/;
export async function verifyQaWindowsCandidateArchive({
 pool,env=process.env,inspect=inspectQaWindowsReconciliation,
}={}){
 if(env.QA_WINDOWS_CANDIDATE_VERIFY!=='1'||
    env.QA_WINDOWS_RECONCILE_REVIEW!=='1'||
    env.QA_FAILOVER!=='OFF'||
    typeof pool?.query!=='function'||typeof pool?.connect!=='function'||
    typeof inspect!=='function')bad('qa_candidate_local_verify_disabled');
 const server=(await pool.query(
  "SELECT current_database() AS db,current_setting('server_version_num')::int AS version,"+
  " pg_is_in_recovery() AS recovering")).rows?.[0];
 if(server?.db!=='qa_dashboard_lab'||server.version<170000||
    server.version>=180000||server.recovering!==false)
  bad('qa_candidate_local_pg17_required');
 // The actual reviewer verifies both immutable snapshots' JSON hashes and
 // all eleven independently stored dataset manifests in one read-only tx.
 const rows=(await pool.query(
  "SELECT snapshot_id FROM qa_failover_v1.live_snapshot_batches"+
  " WHERE snapshot_id<>(SELECT active_snapshot_id FROM qa_failover_v1.state WHERE id=1)"+
  " AND source_provenance='verified-firestore-server-export'"+
  " AND status='copy_verified' AND approved_for_failover=false"+
  " ORDER BY source_exported_at DESC,snapshot_id DESC LIMIT 1")).rows||[];
 const candidateId=rows[0]?.snapshot_id;
 if(typeof candidateId!=='string'||!ID.test(candidateId))
  bad('qa_candidate_no_local_copy_found');
 const result=await inspect({
  pool,candidateSnapshotId:candidateId,
  env:{...env,QA_WINDOWS_RECONCILE_REVIEW:'1',QA_FAILOVER:'OFF'},
 });
 if(result?.datasets!==11||result.localCopyVerified!==true||
    result.sourceContinuityVerified!==false||result.failoverReady!==false||
    result.sourceFreshnessAfterCandidate!==false||
    !Number.isSafeInteger(result.baselineDocuments)||
    !Number.isSafeInteger(result.candidateDocuments)||
    !Number.isSafeInteger(result.changedDatasets)||
    !['added','removed','modified','unchanged'].every(
      k=>Number.isSafeInteger(result[k])&&result[k]>=0)||
    result.added+result.modified+result.unchanged!==result.candidateDocuments||
    result.removed+result.modified+result.unchanged!==result.baselineDocuments)
  bad('qa_candidate_local_review_failed');
 return Object.freeze({
  status:'LOCAL_CANDIDATE_HASHES_AND_MANIFESTS_RECHECKED',
  oldDocuments:result.baselineDocuments,newDocuments:result.candidateDocuments,
  changedDatasets:result.changedDatasets,
  added:result.added,removed:result.removed,
  modified:result.modified,unchanged:result.unchanged,
  failoverReady:false,sourceContinuityVerified:false,
 });
}
async function main(){
 if(process.env.QA_WINDOWS_CANDIDATE_VERIFY!=='1'||
    process.env.QA_WINDOWS_RECONCILE_REVIEW!=='1'||
    process.env.QA_FAILOVER!=='OFF'||!process.env.PGPASSWORD)
  bad('qa_candidate_local_verify_disabled');
 const pg=(await import('pg')).default;
 const pool=new pg.Pool({
  host:'127.0.0.1',port:5432,database:'qa_dashboard_lab',
  user:'postgres',password:process.env.PGPASSWORD,
  connectionTimeoutMillis:5000,statement_timeout:30000,max:2,
  options:'-c default_transaction_read_only=on',
 });
 try{
  const v=await verifyQaWindowsCandidateArchive({pool});
  console.log('QA_WINDOWS_ARCHIVE_VERIFY='+v.status);
  console.log('QA_WINDOWS_ARCHIVE_OLD_DOCUMENTS='+v.oldDocuments);
  console.log('QA_WINDOWS_ARCHIVE_NEW_DOCUMENTS='+v.newDocuments);
  console.log('QA_WINDOWS_ARCHIVE_ADDED='+v.added);
  console.log('QA_WINDOWS_ARCHIVE_REMOVED='+v.removed);
  console.log('QA_WINDOWS_ARCHIVE_MODIFIED='+v.modified);
  console.log('QA_WINDOWS_ARCHIVE_UNCHANGED='+v.unchanged);
  console.log('QA_WINDOWS_ARCHIVE_CHANGED_DATASETS='+v.changedDatasets);
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(()=>{console.error('QA_WINDOWS_ARCHIVE_VERIFY=FAILED_CLOSED_NO_CHANGES');process.exitCode=2;})
 .finally(()=>{
  console.log('QA_WINDOWS_ARCHIVE_FIRESTORE_READS=0');
  console.log('QA_WINDOWS_SOURCE_CONTINUITY=NOT_CERTIFIED');
  console.log('QA_SOURCE_LISTENER=NOT_STARTED_BY_CHECK');
  console.log('QA_FAILOVER=OFF');
 });
}
