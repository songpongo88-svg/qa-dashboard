// Standalone Windows QA DELTA receiver, loopback 127.0.0.1:8791 ONLY.
// No production auto-enable; no listening until explicitly configured with
// an independent Google Cloud Tasks OIDC identity and private-hop HMAC.
// Writes ONLY to qa_failover_v1.source_delta_* via a dedicated DB role.
// This does not certify missing-event detection, live parity or failover.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {createQaSourceDeltaHttpHandler} from './qaSourceDeltaHttpHandler.js';
import {createQaGoogleTaskAttestor} from './qaGoogleTaskAttestor.js';
import {appendQaSourceDelta} from './qaSourceDeltaJournal.js';
import {validateLocalQaConnectionString} from './qaLocalBridgeServer.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const EMAIL=/^[a-zA-Z0-9._+-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const URI=/^https:\/\/[a-z0-9.-]+\/v1\/qa\/source-delta$/;
const secret=x=>typeof x==='string'&&x.length>=64&&x.length<=512&&
 /^[\x21-\x7e]+$/.test(x);
export function validateQaWindowsDeltaConfig(env={}){
 if(env.QA_LOCAL_DELTA_ENABLED!=='1')fail('qa_delta_receiver_disabled');
 if(!validateLocalQaConnectionString(env.QA_LOCAL_DELTA_DATABASE_URL))
  fail('qa_delta_local_database_missing');
 if(!secret(env.QA_LOCAL_DELTA_HMAC_SECRET)||
    env.QA_LOCAL_DELTA_HMAC_SECRET===env.QA_LOCAL_BRIDGE_TOKEN||
    env.QA_LOCAL_DELTA_HMAC_SECRET===env.QA_LOCAL_STANDBY_DATA_TOKEN)
  fail('qa_delta_distinct_private_hmac_required');
 if(!URI.test(env.QA_LOCAL_DELTA_SOURCE_AUDIENCE||'')||
    !EMAIL.test(env.QA_LOCAL_DELTA_SOURCE_SA_EMAIL||''))
  fail('qa_delta_google_identity_not_configured');
 if(env.QA_LOCAL_DELTA_PORT!==undefined&&
    String(env.QA_LOCAL_DELTA_PORT)!=='8791')
  fail('qa_delta_port_must_be_8791');
 return Object.freeze({
  port:8791,databaseUrl:env.QA_LOCAL_DELTA_DATABASE_URL,
  secret:env.QA_LOCAL_DELTA_HMAC_SECRET,
  audience:env.QA_LOCAL_DELTA_SOURCE_AUDIENCE,
  serviceAccountEmail:env.QA_LOCAL_DELTA_SOURCE_SA_EMAIL,
 });
}
export async function createQaWindowsDeltaReceiver({
 env=process.env,pgModule,serverFactory=createServer,
 sourceAttestor,
}={}){
 const config=validateQaWindowsDeltaConfig(env);
 const test=env.QA_PG_ISOLATED_TEST==='1';
 if(!test&&(pgModule||serverFactory!==createServer||sourceAttestor))
  fail('qa_delta_receiver_production_injection_forbidden');
 let pool,server;
 try{
  const pg=pgModule||(await import('pg')).default;
  pool=new pg.Pool({connectionString:config.databaseUrl,max:2,
   connectionTimeoutMillis:4000,idleTimeoutMillis:10000,
   statement_timeout:5000});
  const rights=(await pool.query(
   "SELECT current_database() AS db,current_user AS db_role,"+
   " current_setting('transaction_read_only') AS read_only,"+
   " r.rolsuper AS superuser,r.rolcreaterole AS creates_role,"+
   " r.rolcreatedb AS creates_db,r.rolinherit AS inherits_role,"+
   " has_table_privilege(current_user,'qa_failover_v1.state','SELECT') AS state_read,"+
   " has_table_privilege(current_user,'qa_failover_v1.state','UPDATE') AS state_write,"+
   " has_table_privilege(current_user,'qa_failover_v1.live_snapshot_batches','SELECT') AS baseline_read,"+
   " has_table_privilege(current_user,'qa_failover_v1.source_delta_events','SELECT') AS event_read,"+
   " has_table_privilege(current_user,'qa_failover_v1.source_delta_events','INSERT') AS event_insert,"+
   " has_table_privilege(current_user,'qa_failover_v1.source_delta_events','UPDATE') AS event_update,"+
   " has_table_privilege(current_user,'qa_failover_v1.source_delta_latest','SELECT') AS latest_read,"+
   " has_table_privilege(current_user,'qa_failover_v1.source_delta_latest','INSERT') AS latest_insert,"+
   " has_table_privilege(current_user,'qa_failover_v1.source_delta_latest','UPDATE') AS latest_update,"+
   " has_table_privilege(current_user,'qa_failover_v1.evaluations','INSERT,UPDATE,DELETE') AS case_write,"+
   " has_table_privilege(current_user,'qa_failover_v1.outbox','INSERT,UPDATE,DELETE') AS outbox_write"+
   " FROM pg_roles r WHERE r.rolname=current_user"
  )).rows?.[0];
  if(!rights||
     (rights.db!=='qa_dashboard_lab'&&
       !(test&&rights.db==='qa_cutover_ci_test'))||
     rights.db_role!=='qa_delta_ingester'||
     rights.read_only!=='off'||rights.superuser!==false||
     rights.creates_role!==false||rights.creates_db!==false||
     rights.inherits_role!==false||
     rights.state_read!==true||rights.state_write!==false||
     rights.baseline_read!==true||rights.event_read!==true||
     rights.event_insert!==true||rights.event_update!==true||
     rights.latest_read!==true||rights.latest_insert!==true||
     rights.latest_update!==true||
     rights.case_write!==false||rights.outbox_write!==false)
    fail('qa_delta_ingester_role_not_safe');
  const verifySource=sourceAttestor||createQaGoogleTaskAttestor({
   audience:config.audience,serviceAccountEmail:config.serviceAccountEmail,
  });
  const handler=createQaSourceDeltaHttpHandler({
   secret:config.secret,
   recordVerifiedEvent:(event,request)=>appendQaSourceDelta({
    pool,event,attestSourceEvent:async normalized=>
      verifySource(normalized,request.headers?.authorization),
   }),
  });
  server=serverFactory((req,res)=>{
   Promise.resolve(handler(req,res)).catch(()=>{
    try{
     if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store'});
     if(!res.writableEnded)res.end();
    }catch{}
   });
  });
  server.requestTimeout=7000;
  server.headersTimeout=8000;
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(config.port,'127.0.0.1',()=>{
    server.off('error',reject);resolve();
   });
  });
  return Object.freeze({
   port:8791,sourceOnly:true,failoverReady:false,canAcceptWrites:false,
   shutdown:async()=>{
    await new Promise(resolve=>server.close(resolve));
    await pool.end();
   },
  });
 }catch(error){
  if(server)await new Promise(resolve=>server.close(resolve)).catch(()=>{});
  await pool?.end?.().catch(()=>{});
  throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 createQaWindowsDeltaReceiver().then(instance=>{
  console.log('QA_DELTA_RECEIVER_PORT='+instance.port);
  console.log('QA_DELTA_RECEIVER=PRIVATE_LOOPBACK_ONLY');
  console.log('QA_DELTA_RECEIVER_WRITES=DELTA_JOURNAL_ONLY');
  console.log('QA_FAILOVER=OFF');
  let closing=false;
  const shut=()=>{if(closing)return;closing=true;void instance.shutdown();};
  process.once('SIGINT',shut);process.once('SIGTERM',shut);
 }).catch(error=>{
  console.error('QA_DELTA_RECEIVER=START_BLOCKED_'+(
   /^[a-z_]+$/.test(error?.code||'')?error.code:'CONFIGURATION'));
  process.exitCode=2;
 });
}
