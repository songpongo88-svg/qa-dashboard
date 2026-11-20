// Disposable PostgreSQL 17 proof candidate. NEVER source Firestore or Supabase.
// All source commit/read results are synthetic server-only fixtures.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {qaCanonicalDocumentHash} from '../server/qaLiveMirrorStage.js';
import {stageQaCoreSourceVerificationCandidate}
 from '../server/qaCoreSourceVerificationCandidateStage.js';
import {createQaCoreIndependentSourceRead}
 from '../server/qaCoreIndependentSourceReadStage.js';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_disposable_database_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
const env={QA_CORE_SOURCE_VERIFICATION_STAGE:'1',
 QA_CORE_SOURCE_READ_ADAPTER_TEST:'1',
 QA_CORE_PRIVATE_OUTBOX_STAGING:'1',QA_PG_ISOLATED_TEST:'1',QA_FAILOVER:'OFF'};
const project='qa-dashboard-b0b5d';
const rev='2026-11-20T08:10:02.123456Z';
const sourcePath='qa_evaluations/AA_SYNTHETIC_051';
const event={
 operationId:'qa-verification-stage-synthetic-00001',
 documentPath:sourcePath,operation:'upsert',
 documentJson:{fields:{finalScore:{integerValue:'85'},agent:{stringValue:'Fixture'}}},
};
const hash=qaCanonicalDocumentHash(event.documentJson);
const commit={authority:'qa-core-internal-firestore-commit',
 projectId:project,operationId:event.operationId,documentPath:sourcePath,
 payloadHash:hash,authenticatedServerWrite:true,
 serverAuthorizationEnforced:true,writePreconditionVerified:true,
 commitAcknowledged:true,updateTime:rev};
const documentJson={
 name:'projects/'+project+'/databases/(default)/documents/'+sourcePath,
 fields:event.documentJson.fields,createTime:'2026-11-20T08:00:00.000000Z',
 updateTime:rev,
};
const source={authority:'qa-core-independent-server-source-read',
 projectId:project,documentPath:sourcePath,
 authenticatedServerRead:true,readBudgetReserved:true,
 sourceReadVerified:true,documentJson};
let commitChecks=0,readChecks=0;
const attestServerCommit=async()=>{commitChecks++;return commit;};
const readAdapter=createQaCoreIndependentSourceRead({
 oauthToken:'mock-server-token-never-real-0123456789',
 reserveRead:async req=>{
  assert.equal(req.requestedPageSize,1);
  assert.equal(req.documentPath,sourcePath);
  return{estimatedNotBilledReads:true,budgetDayUtc:'2026-11-20',
   reservedDocumentUnits:1,reservedRequests:1};
 },
 fetchImpl:async (url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.ok(url.endsWith('/qa_evaluations/AA_SYNTHETIC_051'));
  return{status:200,headers:{get:key=>key==='content-type'?'application/json':null},
   json:async()=>documentJson};
 },
 env,
});
const readIndependentSource=async req=>{readChecks++;return readAdapter(req);};
const run=(other={})=>stageQaCoreSourceVerificationCandidate({
 pool,event,attestServerCommit,readIndependentSource,env,...other,
});
const table='qa_core_replication_stage.source_verification_candidates';
try{
 const db=(await pool.query('SELECT current_database() AS db')).rows?.[0]?.db;
 assert.equal(db,'qa_cutover_ci_test');
 const ddl=await readFile(new URL(
  '../migration/qa-core-source-verification-candidate-stage.sql',import.meta.url),'utf8');
 await pool.query(ddl);
 await pool.query('INSERT INTO qa_core_replication_stage.change_outbox'+
  ' (operation_id,collection_name,document_path,operation,document_json,payload_sha256)'+
  " VALUES ($1,'qa_evaluations',$2,'upsert',$3::jsonb,$4)",
  [event.operationId,event.documentPath,JSON.stringify(event.documentJson),hash]);
 await assert.rejects(run({env:{...env,QA_FAILOVER:'ON'}}),
  /qa_source_candidate_disabled/);
 assert.equal(commitChecks,0);
 await assert.rejects(run({event:{...event,operation:'delete',documentJson:null}}),
  /qa_source_candidate_delete_not_verified/);
 assert.equal(commitChecks,0);
 await assert.rejects(run({attestServerCommit:async()=>({...commit,
  writePreconditionVerified:false})}),/qa_source_candidate_trusted_commit_missing/);
 await assert.rejects(run({attestServerCommit:async()=>({...commit,
  updateTime:'2026-11-20T08:10:02.123Z'})}),
  /qa_source_candidate_trusted_commit_missing/);
 await assert.rejects(run({readIndependentSource:async()=>({...source,
  readBudgetReserved:false})}),/qa_source_candidate_independent_read_missing/);
 await assert.rejects(run({readIndependentSource:async()=>({...source,
  documentJson:{...documentJson,updateTime:'2026-11-20T08:10:03.123456Z'}})}),
  /qa_source_candidate_independent_read_missing/);
 await assert.rejects(run({readIndependentSource:async()=>({...source,
  documentJson:{...documentJson,fields:{...documentJson.fields,
   finalScore:{integerValue:'84'}}}})}),
  /qa_source_candidate_source_fields_differ/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table))
  .rows[0].n,0);
 const first=await run();
 assert.equal(first.status,'SOURCE_READ_PROOF_STAGED_REVIEW_REQUIRED');
 assert.equal(first.replay,false);
 assert.equal(first.sourceConfirmed,false);
 assert.equal(first.deliveryEligible,false);
 assert.equal(first.failoverReady,false);
 assert.equal((await run()).replay,true);
 const row=(await pool.query('SELECT observed_revision,field_hash,document_hash,'+
  ' review_status,delivery_eligible,source_continuity_certified'+
  ' FROM '+table+' WHERE operation_id=$1',[event.operationId])).rows[0];
 assert.equal(row.observed_revision,rev);
 assert.match(row.field_hash,/^[0-9a-f]{64}$/);
 assert.match(row.document_hash,/^[0-9a-f]{64}$/);
 assert.equal(row.review_status,'review_required');
 assert.equal(row.delivery_eligible,false);
 assert.equal(row.source_continuity_certified,false);
 const intent=(await pool.query('SELECT source_state,delivery_state FROM'+
  ' qa_core_replication_stage.change_outbox WHERE operation_id=$1',
  [event.operationId])).rows[0];
 assert.deepEqual(intent,{source_state:'pending',delivery_state:'waiting'});
 await assert.rejects(run({
  attestServerCommit:async()=>({...commit,updateTime:'2026-11-20T08:10:05.123456Z'}),
  readIndependentSource:async()=>({...source,
   documentJson:{...documentJson,updateTime:'2026-11-20T08:10:05.123456Z'}}),
 }),/qa_source_candidate_replay_conflict/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table))
  .rows[0].n,1);
 await assert.rejects(pool.query('UPDATE '+table+
  ' SET delivery_eligible=true'),e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE '+table+
  " SET review_status='approved'"),e=>e.code==='23514');
 await pool.query("DO $x$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='qa_ci_source_proof_unprivileged') THEN CREATE ROLE qa_ci_source_proof_unprivileged NOLOGIN; END IF; END $x$;");
 const role=(await pool.query(
  "SELECT c.relrowsecurity,c.relforcerowsecurity,"+
  " has_schema_privilege('qa_ci_source_proof_unprivileged','qa_core_replication_stage','USAGE') AS schema_usage,"+
  " has_table_privilege('qa_ci_source_proof_unprivileged',c.oid,'SELECT') AS table_access"+
  " FROM pg_class c WHERE c.oid=$1::regclass",[table])).rows[0];
 assert.equal(role.relrowsecurity,true);
 assert.equal(role.relforcerowsecurity,true);
 assert.equal(role.schema_usage,false);
 assert.equal(role.table_access,false);
 console.log('PASS isolated QA source proof stage: exact source revision and typed fields, immutable review-only candidate, idempotent, delivery blocked, no real Firestore');
}finally{await pool.end();}
