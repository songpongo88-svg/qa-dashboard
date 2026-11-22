// Explicit, one-attempt-per-UTC-day QA Core snapshot parity diagnostic.
// Reads 11 collections through REST with one readTime and persistent budget.
// No QA case output, no standby writes (except source-read reservation), no
// listener, no automatic retry, and absolutely no failover activation.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {open} from 'node:fs/promises';
import {loadQaWindowsProbeBaseline} from '../server/qaWindowsProbeBaseline.js';
import {createQaSourceReadBudget} from '../server/qaSourceReadBudget.js';
import {checkQaWindowsPointInTimeParity} from '../server/qaWindowsSourceParity.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const safe=new Set([
 'qa_source_parity_disabled','qa_source_parity_adc_missing',
 'qa_source_parity_untrusted_frozen_snapshot',
 'qa_source_parity_invalid_frozen_digest','qa_source_parity_incomplete_manifest',
 'qa_source_parity_invalid_reservation_request',
 'qa_source_parity_durable_reservation_missing',
 'qa_source_parity_source_receipt_invalid',
 'qa_source_parity_frozen_snapshot_changed',
 'qa_manifest_unverified_or_unbudgeted_snapshot',
 'qa_manifest_incomplete_local_snapshot','qa_manifest_source_hash_mismatch',
 'qa_manifest_dataset_digest_mismatch','qa_manifest_source_revision_missing',
 'qa_manifest_standby_must_remain_frozen',
 'source_daily_budget_exhausted','source_daily_budget_storage_unavailable',
 'firestore_quota_or_permission_blocked','firestore_source_unreachable',
 'firestore_source_unverified','firestore_snapshot_read_budget_exhausted',
 'firestore_invalid_source_page','firestore_invalid_document',
 'firestore_duplicate_document','firestore_source_size_exceeded',
 'read_time_outside_verified_window','snapshot_read_budget_invalid',
 'qa_parity_insufficient_reserved_headroom','qa_parity_already_attempted_today',
 'qa_parity_local_db_invalid',
]);
export async function runQaWindowsSourceParity({
 env=process.env,
 poolOverride=null,
 oauthToken=env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN,
 fetchImpl=fetch,
}={}){
 if(env.QA_WINDOWS_SOURCE_PARITY!=='1'||
    env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||
    env.QA_FAILOVER!=='OFF'||
    !env.QA_WINDOWS_PARITY_STAGE_ROOT||
    typeof oauthToken!=='string'||oauthToken.length<20)
   fail('qa_source_parity_disabled');
 const pg=poolOverride?null:(await import('pg')).default;
 const pool=poolOverride||new pg.Pool({
  host:'127.0.0.1',port:5432,database:'qa_dashboard_lab',
  user:'postgres',password:env.PGPASSWORD,
  max:3,connectionTimeoutMillis:5000,statement_timeout:30000,
 });
 try{
  const cfg=(await pool.query("SELECT current_database() AS db,"+
   " current_setting('server_version_num')::int AS version,"+
   " pg_is_in_recovery() AS recovering,"+
   " to_regclass('qa_failover_v1.source_read_budget_daily') IS NOT NULL AS ledger"
  )).rows?.[0];
  if(cfg?.db!=='qa_dashboard_lab'||cfg.version<170000||
     cfg.version>=180000||cfg.recovering!==false||cfg.ledger!==true)
   fail('qa_parity_local_db_invalid');
  const baseline=await loadQaWindowsProbeBaseline({pool,env,maxInitialReads:3000});
  // Reserve enough predicted headroom to complete an unchanged source
  // BEFORE attempting any Firestore GET, even when current reserves exist.
  const needed=50*baseline.datasetManifests.reduce(
   (n,m)=>n+Math.max(1,Math.ceil(m.count/50)),0);
  const requests=baseline.datasetManifests.reduce(
   (n,m)=>n+Math.max(1,Math.ceil(m.count/50)),0);
  const usage=(await pool.query(
   "SELECT reserved_document_units, reserved_requests FROM"+
   " qa_failover_v1.source_read_budget_daily"+
   " WHERE budget_day=(now() AT TIME ZONE 'UTC')::date"+
   " AND project_id='qa-dashboard-b0b5d'"
  )).rows?.[0];
  if(needed>3000||requests>80||
    Number(usage?.reserved_document_units||0)+needed>3000||
    Number(usage?.reserved_requests||0)+requests>80)
   fail('qa_parity_insufficient_reserved_headroom');
  // Exclusive local marker; never auto-retry on timeout or quota errors.
  const utc=new Date().toISOString().slice(0,10).replaceAll('-','');
  const marker=join(env.QA_WINDOWS_PARITY_STAGE_ROOT,
    '.qa-parity-attempt-'+utc);
  let fd;
  try{fd=await open(marker,'wx',0o600);}
  catch(e){
   if(e?.code==='EEXIST')fail('qa_parity_already_attempted_today');
   throw e;
  }
  await fd.close();
  const budget=createQaSourceReadBudget({
   client:pool,projectId:'qa-dashboard-b0b5d',
   dailyDocumentLimit:3000,dailyRequestLimit:80,
  });
  const result=await checkQaWindowsPointInTimeParity({
   pool,accessToken:oauthToken,fetchImpl,env,
   reserveRead:request=>budget.reserve(request),
  });
  return result;
 }finally{
  if(!poolOverride)await pool.end();
 }
}
export function qaParityExitCode(result){
 if(result?.result==='MATCHED_AT_SINGLE_READ_TIME'&&
    result?.mismatchedDatasetCount===0&&
    result?.sourceCollections===11&&result?.failoverReady===false)
   return 0;
 if(result?.result==='DIFFERS_FROM_FROZEN_COPY'&&
    Number.isSafeInteger(result?.mismatchedDatasetCount)&&
    result.mismatchedDatasetCount>0)
   return 3;
 return 2; // fail closed for unknown or contradictory receipts
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runQaWindowsSourceParity().then(r=>{
  console.log('QA_SOURCE_PARITY='+r.result);
  console.log('QA_SOURCE_PARITY_DATASETS='+r.sourceCollections);
  console.log('QA_SOURCE_PARITY_FROZEN_DOCUMENTS='+r.frozenDocumentCount);
  console.log('QA_SOURCE_PARITY_SOURCE_DOCUMENTS='+r.sourceDocumentCount);
  console.log('QA_SOURCE_PARITY_CHANGED_DATASETS='+r.mismatchedDatasetCount);
  console.log('QA_SOURCE_PARITY_DOCUMENT_UNITS_RESERVED='+r.reservedUnitsThisRun);
  console.log('QA_SOURCE_PARITY_REST_REQUESTS='+r.apiRequests);
  console.log('QA_SOURCE_PARITY_CONTINUOUS=NOT_CERTIFIED');
  const code=qaParityExitCode(r);
  if(code===3)console.log('QA_SOURCE_PARITY_ACTION=RECONCILIATION_REQUIRED');
  if(code===2)console.log('QA_SOURCE_PARITY_ACTION=UNVERIFIED_RESULT');
  if(code!==0)process.exitCode=code;
 }).catch(e=>{
  console.log('QA_SOURCE_PARITY='+(safe.has(e?.code||e?.message)?
    e.code||e.message:'CHECK_BLOCKED'));
  process.exitCode=2;
 }).finally(()=>{
  console.log('QA_SOURCE_PARITY_OTHER_CLIENT_USAGE=UNKNOWN');
  console.log('QA_SOURCE_LISTENER=NOT_STARTED');
  console.log('QA_FAILOVER=OFF');
 });
}
