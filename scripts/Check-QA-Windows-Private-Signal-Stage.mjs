// Windows QA standby read-only acceptance check. No Firestore, HTTP, 
// live receiver, Supabase, QA score writes or failover activation.
// Prints only counts/status codes; do not expose document bodies or DB passwords.
import {pathToFileURL} from 'node:url';
import {loadQaWindowsProbeBaseline} from '../server/qaWindowsProbeBaseline.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const SAFE=/^qa_(?:stage|manifest|windows)_[a-z0-9_]+$/;
export async function inspectQaWindowsPrivateStage({pool,env=process.env}={}){
 if(env.QA_WINDOWS_STAGE_ACCEPTANCE!=='1'||env.QA_FAILOVER!=='OFF'||
    env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||typeof pool?.query!=='function'||
    typeof pool?.connect!=='function')
   fail('qa_windows_acceptance_disabled');
 const server=(await pool.query(
   "SELECT current_database() AS name,current_setting('server_version_num')::int AS version,"+
   " pg_is_in_recovery() AS recovering")).rows?.[0];
 if(server?.name!=='qa_dashboard_lab'||
    server.version<170000||server.version>=180000||
    server.recovering!==false)
   fail('qa_windows_stage_wrong_local_postgres');
 const state=(await pool.query(
   "SELECT to_regclass('qa_windows_probe_v1.source_signals') IS NOT NULL AS signal_table,"+
   " to_regclass('qa_failover_v1.source_delta_events') IS NOT NULL AS delta_table,"+
   " to_regclass('qa_failover_v1.live_snapshot_rows') IS NOT NULL AS snapshot_table"
 )).rows?.[0];
 if(!state?.signal_table||!state.delta_table||!state.snapshot_table)
   fail('qa_windows_stage_schema_incomplete');
 const stats=(await pool.query(
   "SELECT count(*)::int AS total,"+
   " count(*) FILTER (WHERE source_commit_verified=true OR needs_reconciliation=false)::int AS unsafe"+
   " FROM qa_windows_probe_v1.source_signals")).rows?.[0];
 if(!Number.isSafeInteger(stats?.total)||stats.total!==0||stats.unsafe!==0)
   fail('qa_windows_stage_signal_queue_requires_review');
 // Public schema usage is evaluated with ACL grantee 0, not a fake PUBLIC role.
 const permissions=(await pool.query(
   "SELECT EXISTS(SELECT 1 FROM pg_namespace n"+
   " CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl"+
   " WHERE n.nspname='qa_windows_probe_v1'"+
   " AND acl.grantee=0 AND acl.privilege_type='USAGE') AS public_usage"
 )).rows?.[0];
 if(permissions?.public_usage!==false)
   fail('qa_windows_stage_public_acl_unsafe');
 const manifest=await loadQaWindowsProbeBaseline({pool,env});
 if(manifest?.completeCopiedDatasetCount!==11||
    manifest.failoverReady!==false||manifest.sourceFreshnessVerified!==false||
    !Number.isSafeInteger(manifest.estimatedInitialReads)||
    manifest.estimatedInitialReads>3000)
   fail('qa_windows_stage_baseline_unverified');
 return Object.freeze({
  status:'LOCAL_PRIVATE_STAGE_VERIFIED',
  copiedDatasets:manifest.completeCopiedDatasetCount,
  estimatedInitialReads:manifest.estimatedInitialReads,
  signalRows:stats.total,sourceFreshnessVerified:false,
  firestoreReadsByThisCheck:0,listenerStartedByThisCheck:false,
  failoverEnabledByThisCheck:false,
 });
}
async function run(){
 if(process.env.QA_WINDOWS_STAGE_ACCEPTANCE!=='1'||
    process.env.QA_FAILOVER!=='OFF'||
    process.env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||
    !process.env.PGPASSWORD)
   fail('qa_windows_acceptance_disabled');
 const pg=(await import('pg')).default;
 const pool=new pg.Pool({host:'127.0.0.1',port:5432,
  database:'qa_dashboard_lab',user:'postgres',password:process.env.PGPASSWORD,
  max:2,connectionTimeoutMillis:5000,statement_timeout:20000,
  // Even accidental future mutations must fail at the PostgreSQL session.
  options:'-c default_transaction_read_only=on'});
 try{
  const result=await inspectQaWindowsPrivateStage({pool});
  console.log('QA_WINDOWS_STAGE_ACCEPTANCE='+result.status);
  console.log('QA_WINDOWS_STAGE_DATASETS='+result.copiedDatasets);
  console.log('QA_WINDOWS_STAGE_ESTIMATED_INITIAL_READS='+result.estimatedInitialReads);
  console.log('QA_WINDOWS_STAGE_SIGNAL_ROWS='+result.signalRows);
  console.log('QA_WINDOWS_STAGE_SOURCE_FRESHNESS=NOT_CERTIFIED');
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 run().catch(error=>{
  const code=typeof error?.code==='string'&&SAFE.test(error.code)?
    error.code:'qa_windows_stage_verification_failed_closed';
  console.error('QA_WINDOWS_STAGE_ACCEPTANCE='+code.toUpperCase());
  process.exitCode=2;
 }).finally(()=>{
  console.log('QA_WINDOWS_STAGE_FIRESTORE_READS=0');
  console.log('QA_WINDOWS_STAGE_LISTENER=NOT_STARTED_BY_CHECK');
  console.log('QA_FAILOVER=OFF');
 });
}
