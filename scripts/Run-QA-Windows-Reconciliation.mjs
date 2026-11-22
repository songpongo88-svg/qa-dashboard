// ONE real, explicitly opt-in Firestore -> immutable Windows PostgreSQL
// candidate snapshot -> local reconciliation report. No automatic start.
// Never modifies the old frozen snapshot or QA production/case tables.
// This may consume up to 3,000 conservatively reserved Firestore read units.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {open,readdir,stat} from 'node:fs/promises';
import {loadQaWindowsProbeBaseline} from '../server/qaWindowsProbeBaseline.js';
import {captureQaFirestorePointInTime} from '../server/qaFirestoreRestSnapshot.js';
import {createQaSourceReadBudget} from '../server/qaSourceReadBudget.js';
import {stageQaWindowsReconciliationCandidate}
 from '../server/qaWindowsCandidateArchiveStage.js';
import {inspectQaWindowsReconciliation}
 from '../server/qaWindowsReconciliationReview.js';
import {QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
const PROJECT='qa-dashboard-b0b5d';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const MAX_UNITS=3000,MAX_REQUESTS=80,PAGE=50;
const errors=new Set([
 'qa_candidate_disabled','qa_candidate_local_database_unsafe',
 'qa_candidate_baseline_not_verified','qa_candidate_read_budget_unavailable',
 'qa_candidate_preflight_failed','qa_candidate_already_attempted_today',
 'qa_candidate_provider_reset_not_stable',
 'qa_candidate_previous_scan_same_pacific_day',
 'qa_candidate_invalid_source_reservation','qa_candidate_source_unverified',
 'qa_candidate_archive_unverified','qa_candidate_reconciliation_unverified',
 'qa_reconcile_frozen_snapshot_state_changed',
 'qa_reconcile_candidate_not_newer_or_untrusted',
 'qa_reconcile_candidate_source_unverified',
 'qa_reconcile_candidate_staging_disabled',
 'qa_reconcile_candidate_copy_receipt_invalid',
 'qa_manifest_unverified_or_unbudgeted_snapshot',
 'qa_manifest_incomplete_local_snapshot','qa_manifest_source_hash_mismatch',
 'qa_manifest_dataset_digest_mismatch','qa_manifest_standby_must_remain_frozen',
 'source_daily_budget_exhausted','source_daily_budget_storage_unavailable',
 'firestore_quota_or_permission_blocked','firestore_source_unreachable',
 'firestore_source_unverified','firestore_snapshot_read_budget_exhausted',
 'firestore_invalid_source_page','firestore_invalid_document',
 'firestore_duplicate_document','firestore_source_size_exceeded',
 'read_time_outside_verified_window','snapshot_read_budget_invalid',
 'postgres_snapshot_count_mismatch','postgres_snapshot_content_mismatch',
 'qa_reconcile_unverified_batch','qa_reconcile_dataset_digest_mismatch',
 'qa_reconcile_corrupt_snapshot','qa_reconcile_accounting_mismatch',
 'qa_reconcile_missing_candidate','qa_reconcile_candidate_not_newer',
]);
// Firestore free quota resets around midnight Pacific, NOT midnight UTC.
// Compare past *real local scan markers* by Pacific day as well as the
// reservation ledger's UTC day to avoid an unsafe reset-window retry.
const pacificParts=date=>{
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',hourCycle:'h23',
 }).formatToParts(date);
 const part=key=>parts.find(x=>x.type===key)?.value;
 return {day:part('year')+'-'+part('month')+'-'+part('day'),
  hour:Number(part('hour'))};
};
export async function assertQaDifferentPacificScanDay({
 stageRoot,at,
}={}){
 if(typeof stageRoot!=='string'||stageRoot.length<10||
    !(at instanceof Date)||!Number.isFinite(at.getTime()))
  fail('qa_candidate_preflight_failed');
 const now=pacificParts(at);
 // Allow a conservative two-hour cushion after the approximate reset.
 if(!Number.isInteger(now.hour)||now.hour<2)
  fail('qa_candidate_provider_reset_not_stable');
 let entries;
 try{entries=await readdir(stageRoot);}
 catch{fail('qa_candidate_preflight_failed');}
 for(const name of entries){
  if(!/^\.(?:qa-parity-attempt|qa-reconcile-attempt)-\d{8}$/.test(name))
   continue;
  let info;
  try{info=await stat(join(stageRoot,name));}
  catch{fail('qa_candidate_preflight_failed');}
  if(!info.isFile()||!Number.isFinite(info.mtimeMs))
   fail('qa_candidate_preflight_failed');
  if(info.mtimeMs>at.getTime()+60000||
     pacificParts(info.mtime).day===now.day)
   fail('qa_candidate_previous_scan_same_pacific_day');
 }
}
const markAttempt=async path=>{
 let fd;
 try{fd=await open(path,'wx',0o600);}
 catch(err){
  if(err?.code==='EEXIST')fail('qa_candidate_already_attempted_today');
  fail('qa_candidate_preflight_failed');
 }
 await fd.close();
};
export async function runQaWindowsReconciliation({
 env=process.env,poolOverride=null,
 oauthToken=env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN,
 fetchImpl=fetch,now=()=>new Date(),
 makeBudget=createQaSourceReadBudget,
 loadBaseline=loadQaWindowsProbeBaseline,
 captureSource=captureQaFirestorePointInTime,
 stageCandidate=stageQaWindowsReconciliationCandidate,
 review=inspectQaWindowsReconciliation,
 createAttemptMarker=markAttempt,
 checkPreviousAttempts=assertQaDifferentPacificScanDay,
}={}){
 if(env.QA_WINDOWS_RECONCILE_RUN!=='1'||
    env.QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE!=='1'||
    env.QA_WINDOWS_RECONCILE_REVIEW!=='1'||
    env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||
    env.QA_FAILOVER!=='OFF'||
    typeof env.QA_WINDOWS_RECONCILE_STAGE_ROOT!=='string'||
    env.QA_WINDOWS_RECONCILE_STAGE_ROOT.length<10||
    typeof oauthToken!=='string'||oauthToken.length<20||
    oauthToken.length>8192||
    typeof now!=='function')
   fail('qa_candidate_disabled');
 const pg=poolOverride?null:(await import('pg')).default;
 const pool=poolOverride||new pg.Pool({
  host:'127.0.0.1',port:5432,database:'qa_dashboard_lab',
  user:'postgres',password:env.PGPASSWORD,max:3,
  connectionTimeoutMillis:5000,statement_timeout:60000,
 });
 try{
  const c=(await pool.query("SELECT current_database() AS db,"+
   " current_setting('server_version_num')::int AS version,"+
   " pg_is_in_recovery() AS recovering,"+
   " to_regclass('qa_failover_v1.live_snapshot_batches') IS NOT NULL AS batches,"+
   " to_regclass('qa_failover_v1.live_snapshot_rows') IS NOT NULL AS snapshots,"+
   " to_regclass('qa_failover_v1.source_read_budget_daily') IS NOT NULL AS ledger"
  )).rows?.[0];
  if((c?.db!=='qa_dashboard_lab'&&
      !(c?.db==='qa_cutover_ci_test'&&env.QA_PG_ISOLATED_TEST==='1'))||
     c.version<170000||
     c.version>=180000||c.recovering!==false||
     c.batches!==true||c.snapshots!==true||c.ledger!==true)
   fail('qa_candidate_local_database_unsafe');
  // The original 2,226 rows stay frozen. Review all 11 source manifests
  // before spending any Firestore document-read quota.
  const baseline=await loadBaseline({pool,env,maxInitialReads:MAX_UNITS});
  if(baseline?.completeCopiedDatasetCount!==11||
     !Array.isArray(baseline.datasetManifests)||
     baseline.datasetManifests.length!==11||
     !baseline.snapshotId||baseline.failoverReady!==false)
   fail('qa_candidate_baseline_not_verified');
  const seen=new Set();
  let minRequests=0;
  for(const row of baseline.datasetManifests){
   if(!QA_SYNC_DATASETS.includes(row?.dataset)||seen.has(row.dataset)||
      !Number.isSafeInteger(row.count)||row.count<0||row.count>MAX_UNITS||
      !/^[a-f0-9]{64}$/.test(row.digest||''))
    fail('qa_candidate_baseline_not_verified');
   seen.add(row.dataset);
   minRequests+=Math.max(1,Math.ceil(row.count/PAGE));
  }
  if(seen.size!==11)fail('qa_candidate_baseline_not_verified');
  const estUnits=minRequests*PAGE;
  if(minRequests>MAX_REQUESTS||estUnits>MAX_UNITS)
   fail('qa_candidate_read_budget_unavailable');
  const usage=(await pool.query(
   'SELECT reserved_document_units,reserved_requests'+
   ' FROM qa_failover_v1.source_read_budget_daily'+
   " WHERE budget_day=(now() AT TIME ZONE 'UTC')::date"+
   ' AND project_id=$1',[PROJECT])).rows?.[0];
  const usedUnits=Number(usage?.reserved_document_units??0);
  const usedRequests=Number(usage?.reserved_requests??0);
  if(!Number.isSafeInteger(usedUnits)||usedUnits<0||
     !Number.isSafeInteger(usedRequests)||usedRequests<0||
     usedUnits+estUnits>MAX_UNITS||usedRequests+minRequests>MAX_REQUESTS)
   fail('qa_candidate_read_budget_unavailable');
  const clock=now();
  if(!(clock instanceof Date)||!Number.isFinite(clock.getTime()))
   fail('qa_candidate_preflight_failed');
  await checkPreviousAttempts({
   stageRoot:env.QA_WINDOWS_RECONCILE_STAGE_ROOT,at:clock,
  });
  const readTime=new Date(clock.getTime()-15000).toISOString();
  // One attempt per UTC day, including any partial HTTP or PG failure.
  // Re-run only in a fresh quota window after independently checking
  // actual Firestore availability; this is NOT a global usage meter.
  const marker=join(env.QA_WINDOWS_RECONCILE_STAGE_ROOT,
   '.qa-reconcile-attempt-'+clock.toISOString().slice(0,10).replaceAll('-',''));
  await createAttemptMarker(marker);
  const budget=makeBudget({
   client:pool,projectId:PROJECT,
   dailyDocumentLimit:MAX_UNITS,dailyRequestLimit:MAX_REQUESTS,
  });
  let requests=0,units=0;
  const captured=await captureSource({
   projectId:PROJECT,accessToken:oauthToken,fetchImpl,
   readTime,pageSize:PAGE,maxDocumentReads:MAX_UNITS,
   maxApiRequests:MAX_REQUESTS,
   beforeRequest:async request=>{
    if(!QA_SYNC_DATASETS.includes(request?.dataset)||
       request?.apiRequestNumber!==requests+1||
       !Number.isSafeInteger(request?.requestedPageSize)||
       request.requestedPageSize<1||request.requestedPageSize>PAGE)
     fail('qa_candidate_invalid_source_reservation');
    const r=await budget.reserve(request);
    if(r?.estimatedNotBilledReads!==true||
       !Number.isSafeInteger(r.reservedDocumentUnits)||
       !Number.isSafeInteger(r.reservedRequests)||
       r.reservedDocumentUnits>MAX_UNITS||
       r.reservedRequests>MAX_REQUESTS)
     fail('qa_candidate_invalid_source_reservation');
    requests++;units+=request.requestedPageSize;
   },
  });
  if(!captured||captured.metadata?.manifests?.length!==11||
     captured.metadata.exportedAt!==readTime||
     captured.verifiedReadTime!==readTime||
     captured.readBudgetReceipt?.apiRequests!==requests||
     !Number.isSafeInteger(captured.sourceCount)||
     captured.sourceCount<0||captured.sourceCount>MAX_UNITS)
   fail('qa_candidate_source_unverified');
  // Stage in a NEW ID under frozen baseline state lock. Database performs
  // independently checked 11-collection content hashes before COMMIT.
  const stored=await stageCandidate({
   pool,baselineSnapshotId:baseline.snapshotId,captured,env});
  if(stored?.status!=='NEW_CANDIDATE_COPY_VERIFIED_NOT_ACTIVE'||
     stored.copiedDocuments!==captured.sourceCount||
     stored.baselinePreserved!==true||stored.failoverReady!==false)
   fail('qa_candidate_archive_unverified');
  const diff=await review({
   pool,candidateSnapshotId:stored.candidateSnapshotId,env});
  if(diff?.datasets!==11||diff?.localCopyVerified!==true||
     diff?.failoverReady!==false||
     diff?.baselineDocuments!==baseline.datasetManifests.reduce((n,m)=>n+m.count,0)||
     diff?.candidateDocuments!==stored.copiedDocuments||
     !Number.isSafeInteger(diff.added)||
     !Number.isSafeInteger(diff.removed)||
     !Number.isSafeInteger(diff.modified)||
     !Number.isSafeInteger(diff.unchanged))
   fail('qa_candidate_reconciliation_unverified');
  return Object.freeze({
   status:'CANDIDATE_ARCHIVED_AND_RECONCILED',
   oldDocuments:diff.baselineDocuments,
   newDocuments:diff.candidateDocuments,
   added:diff.added,removed:diff.removed,modified:diff.modified,
   unchanged:diff.unchanged,changedDatasets:diff.changedDatasets,
   readTime,requests,readUnitsReserved:units,
   baselinePreserved:true,sourceContinuityVerified:false,
   failoverReady:false,
  });
 }finally{if(!poolOverride)await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runQaWindowsReconciliation().then(r=>{
  console.log('QA_RECONCILE='+r.status);
  console.log('QA_RECONCILE_OLD_DOCUMENTS='+r.oldDocuments);
  console.log('QA_RECONCILE_NEW_DOCUMENTS='+r.newDocuments);
  console.log('QA_RECONCILE_ADDED='+r.added);
  console.log('QA_RECONCILE_REMOVED='+r.removed);
  console.log('QA_RECONCILE_MODIFIED='+r.modified);
  console.log('QA_RECONCILE_UNCHANGED='+r.unchanged);
  console.log('QA_RECONCILE_CHANGED_DATASETS='+r.changedDatasets);
  console.log('QA_RECONCILE_REQUESTS='+r.requests);
  console.log('QA_RECONCILE_RESERVED_UNITS='+r.readUnitsReserved);
  console.log('QA_RECONCILE_CONTINUITY=NOT_CERTIFIED');
 }).catch(e=>{
  console.log('QA_RECONCILE='+(errors.has(e?.code||e?.message)?
   (e.code||e.message).toUpperCase():'CHECK_BLOCKED'));
  process.exitCode=2;
 }).finally(()=>{
  console.log('QA_RECONCILE_OTHER_FIRESTORE_USAGE=UNKNOWN');
  console.log('QA_RECONCILE_BASELINE=UNCHANGED');
  console.log('QA_SOURCE_LISTENER=NOT_STARTED');
  console.log('QA_FAILOVER=OFF');
 });
}
