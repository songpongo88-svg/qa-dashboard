// Opt-in QA-only Windows PostgreSQL snapshot stage (NO failover activation).
// Requires a trusted Google OAuth access token with datastore scope,
// preexisting local QA DB credentials and explicit operator opt-in.
// This script is NOT called from browser/Preview or production API.
import {pathToFileURL} from 'node:url';
import {captureQaFirestorePointInTime} from '../server/qaFirestoreRestSnapshot.js';
import {stageQaFirestoreExport} from '../server/qaLiveMirrorStage.js';
import {materializeQaStandbyEvaluationCandidates} from '../server/qaStandbyCandidateMaterializer.js';
import {validateLocalQaConnectionString} from '../server/qaLocalBridgeServer.js';

const no=code=>{console.error('QA_LIVE_SNAPSHOT='+code);process.exitCode=2;};
export async function runQaLiveSnapshotStage({
  env=process.env,pgModule,fetchImpl=fetch,
}={}){
  if(env.QA_LIVE_SNAPSHOT_STAGE_ONLY!=='1')
    throw new Error('explicit_stage_only_opt_in_required');
  const dbUrl=env.QA_LOCAL_DATABASE_URL;
  if(!validateLocalQaConnectionString(dbUrl))
    throw new Error('only_existing_local_qa_dashboard_lab_allowed');
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(env.QA_FIRESTORE_PROJECT_ID||''))
    throw new Error('firestore_project_id_not_configured');
  if(typeof env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN!=='string'||
    env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN.length<20)
    throw new Error('server_firebase_oauth_not_configured');

  const pg=pgModule||(await import('pg')).default;
  const pool=new pg.Pool({
    connectionString:dbUrl,max:1,connectionTimeoutMillis:5000,
    idleTimeoutMillis:10000,statement_timeout:30000,
  });
  try{
    const db=await pool.query('SELECT current_database() AS db');
    if(db.rows?.[0]?.db!=='qa_dashboard_lab')
      throw new Error('unexpected_database_no_migration');
    // All tables are provisioned beforehand using a separate PostgreSQL
    // administrator. Only a least-privilege snapshot importer may run here.
    // Fail BEFORE reading Firestore to preserve its limited daily quota.
    const permission=(await pool.query(
      "SELECT current_user AS role,pg_is_in_recovery() AS recovering,"+
      " current_setting('transaction_read_only') AS transaction_ro,"+
      " to_regclass('qa_failover_v1.live_snapshot_batches') IS NOT NULL AS batches,"+
      " to_regclass('qa_failover_v1.live_snapshot_rows') IS NOT NULL AS rows,"+
      " to_regclass('qa_failover_v1.live_candidate_evaluations') IS NOT NULL AS candidates,"+
      " to_regclass('qa_failover_v1.live_candidate_audit') IS NOT NULL AS audit"
    )).rows?.[0];
    if(permission?.role!=='qa_snapshot_importer')
      throw new Error('postgres_dedicated_importer_required');
    if(permission.recovering===true||permission.transaction_ro!=='off')
      throw new Error('postgres_import_connection_read_only');
    if(!permission.batches||!permission.rows||!permission.candidates||!permission.audit)
      throw new Error('postgres_snapshot_tables_not_installed');
    const privilege=(await pool.query(
      "SELECT has_table_privilege(current_user,'qa_failover_v1.state','SELECT') AS state,"+
      " has_table_privilege(current_user,'qa_failover_v1.live_snapshot_batches','INSERT,SELECT,UPDATE') AS batches,"+
      " has_table_privilege(current_user,'qa_failover_v1.live_snapshot_rows','INSERT,SELECT') AS rows,"+
      " has_table_privilege(current_user,'qa_failover_v1.live_candidate_evaluations','INSERT,SELECT') AS candidates,"+
      " has_table_privilege(current_user,'qa_failover_v1.live_candidate_audit','INSERT,SELECT') AS audit"
    )).rows?.[0];
    if(!privilege||Object.values(privilege).some(value=>value!==true))
      throw new Error('postgres_import_permission_missing');
    const state=(await pool.query(
      'SELECT mode,source_snapshot_verified,write_frozen FROM qa_failover_v1.state WHERE id=1'
    )).rows?.[0];
    if(!state||state.mode!=='disabled'||state.write_frozen!==true||
       state.source_snapshot_verified!==false)
      throw new Error('postgres_standby_not_safely_disabled');
    console.log('QA_IMPORTER_PREFLIGHT=READY_NO_FIRESTORE_READS');
    // Capture and verify the complete pinned Firestore source BEFORE any local
    // schema modification. Quota/auth/network failure must leave PostgreSQL
    // unchanged, including its additive stage tables.
    const captured=await captureQaFirestorePointInTime({
      projectId:env.QA_FIRESTORE_PROJECT_ID,
      accessToken:env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN,
      fetchImpl,
    });
    // Tables are already installed by the guarded admin installer.
    // No schema changes, no original archive modifications, no role changes.
    const receipt=await stageQaFirestoreExport({
      pool,metadata:captured.metadata,
      readCollection:dataset=>captured.readCollection(dataset),
    });
    console.log('QA_LIVE_SNAPSHOT=STORED_COPY_VERIFIED');
    // Convert the copy to immutable, app-shaped evaluation candidates in the
    // SAME local database. Never touch the active QA evaluation table.
    const candidate=await materializeQaStandbyEvaluationCandidates({
      pool,snapshotId:receipt.snapshotId,
    });
    console.log('QA_LIVE_CANDIDATES=ORIGINAL_SCORES_VERIFIED');
    console.log('QA_LIVE_CANDIDATE_EVALUATIONS='+candidate.candidateEvaluations);
    console.log('QA_LIVE_SNAPSHOT_DOCUMENTS='+receipt.storedDocuments);
    console.log('QA_LIVE_SNAPSHOT_DATASETS='+receipt.datasets.length);
    console.log('QA_LIVE_SNAPSHOT_SOURCE_READ_TIME='+captured.verifiedReadTime);
    console.log('QA_LIVE_PARITY=NOT_CERTIFIED_FOR_FAILOVER');
    console.log('QA_FAILOVER=OFF');
    return {...receipt,candidate};
  }finally{
    await pool.end();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runQaLiveSnapshotStage().catch(err=>{
    const known=new Set([
      'explicit_stage_only_opt_in_required','only_existing_local_qa_dashboard_lab_allowed',
      'firestore_project_id_not_configured','server_firebase_oauth_not_configured',
      'unexpected_database_no_migration','postgres_import_connection_read_only',
      'postgres_dedicated_importer_required','postgres_snapshot_tables_not_installed',
      'postgres_import_permission_missing','postgres_standby_not_safely_disabled',
      'firestore_quota_or_permission_blocked',
      'firestore_source_unreachable','firestore_source_unverified',
      'firestore_invalid_source_page','source_manifest_mismatch',
    ]);
    // Never print a stack trace, local filesystem path, credentials or QA data.
    no(known.has(err?.code||err?.message)?(err.code||err.message):'STAGE_FAILED_CLOSED');
  });
}
