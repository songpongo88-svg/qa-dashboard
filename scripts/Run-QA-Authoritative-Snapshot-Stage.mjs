// Opt-in QA-only Windows PostgreSQL snapshot stage (NO failover activation).
// Requires a trusted Google OAuth access token with datastore scope,
// preexisting local QA DB credentials and explicit operator opt-in.
// This script is NOT called from browser/Preview or production API.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {captureQaFirestorePointInTime} from '../server/qaFirestoreRestSnapshot.js';
import {stageQaFirestoreExport} from '../server/qaLiveMirrorStage.js';
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
    // Additive tables only; original 2,081-row archive is not modified.
    const sql=await readFile(new URL(
      '../migration/qa-local-live-snapshot-stage.sql',import.meta.url),'utf8');
    await pool.query(sql);
    const captured=await captureQaFirestorePointInTime({
      projectId:env.QA_FIRESTORE_PROJECT_ID,
      accessToken:env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN,
      fetchImpl,
    });
    const receipt=await stageQaFirestoreExport({
      pool,metadata:captured.metadata,
      readCollection:dataset=>captured.readCollection(dataset),
    });
    console.log('QA_LIVE_SNAPSHOT=STORED_COPY_VERIFIED');
    console.log('QA_LIVE_SNAPSHOT_DOCUMENTS='+receipt.storedDocuments);
    console.log('QA_LIVE_SNAPSHOT_DATASETS='+receipt.datasets.length);
    console.log('QA_LIVE_SNAPSHOT_SOURCE_READ_TIME='+captured.verifiedReadTime);
    console.log('QA_LIVE_PARITY=NOT_CERTIFIED_FOR_FAILOVER');
    console.log('QA_FAILOVER=OFF');
    return receipt;
  }finally{
    await pool.end();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runQaLiveSnapshotStage().catch(err=>{
    const known=new Set([
      'explicit_stage_only_opt_in_required','only_existing_local_qa_dashboard_lab_allowed',
      'firestore_project_id_not_configured','server_firebase_oauth_not_configured',
      'unexpected_database_no_migration','firestore_quota_or_permission_blocked',
      'firestore_source_unreachable','firestore_source_unverified',
      'firestore_invalid_source_page','source_manifest_mismatch',
    ]);
    // Never print a stack trace, local filesystem path, credentials or QA data.
    no(known.has(err?.code||err?.message)?(err.code||err.message):'STAGE_FAILED_CLOSED');
  });
}
