// Isolated PostgreSQL 17 tests: private schema, unacknowledged intents
// ineligible for delivery, idempotency, lease reclaim, and no public access.
// Runs ONLY against disposable qa_cutover_ci_test, never connected Supabase.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_disposable_database_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
try{
 const db=(await pool.query('SELECT current_database() AS name')).rows[0].name;
 assert.equal(db,'qa_cutover_ci_test');
 const sql=await readFile(new URL('../migration/qa-core-private-outbox-stage.sql',import.meta.url),'utf8');
 await pool.query(sql);
 const table='qa_core_replication_stage.change_outbox';
 const event={id:'qa-stage-event-000000001',path:'qa_evaluations/AA100001'};
 const payload={fields:{finalScore:{integerValue:'85'}}};
 const data=['qa_evaluations',event.path,'upsert',JSON.stringify(payload),'a'.repeat(64),event.id];
 await pool.query('INSERT INTO '+table+
  ' (collection_name,document_path,operation,document_json,payload_sha256,operation_id)'+
  ' VALUES ($1,$2,$3,$4::jsonb,$5,$6)',data);
 await assert.rejects(pool.query('INSERT INTO '+table+
  ' (collection_name,document_path,operation,document_json,payload_sha256,operation_id)'+
  ' VALUES ($1,$2,$3,$4::jsonb,$5,$6)',data),e=>e.code==='23505');
 const stillWaiting=(await pool.query('SELECT source_state,delivery_state FROM '+table+
  ' WHERE operation_id=$1',[event.id])).rows[0];
 assert.deepEqual(stillWaiting,{source_state:'pending',delivery_state:'waiting'});
 const noDelivery=(await pool.query('SELECT count(*)::int AS n FROM '+table+
  " WHERE source_state='source_confirmed' AND delivery_state='ready'")).rows[0].n;
 assert.equal(noDelivery,0);
 await pool.query('UPDATE '+table+
  " SET source_state='source_confirmed',delivery_state='ready',source_confirmed_at=now()"+
  ' WHERE operation_id=$1',[event.id]);
 const batch=(await pool.query('UPDATE '+table+
  " SET delivery_state='leased',lease_owner='qa-fixture',lease_expires_at=now()+interval '1 minute',"+
  ' attempted=attempted+1 WHERE seq IN (SELECT seq FROM '+table+
  " WHERE source_state='source_confirmed' AND delivery_state='ready' "+
  ' ORDER BY seq FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING seq,operation_id')).rows;
 assert.equal(batch.length,1);
 const twice=(await pool.query('SELECT count(*)::int AS n FROM '+table+
  " WHERE delivery_state='ready'")).rows[0].n;
 assert.equal(twice,0);
 await pool.query('UPDATE '+table+
  " SET delivery_state='delivered',lease_owner=NULL,lease_expires_at=NULL,"+
  " delivered_at=now() WHERE operation_id=$1 AND delivery_state='leased'",[event.id]);
 assert.equal((await pool.query('SELECT delivery_state FROM '+table+
  ' WHERE operation_id=$1',[event.id])).rows[0].delivery_state,'delivered');
 
 // Real Postgres idempotency must compare semantic JSONB, not key ordering.
 const {stageQaCorePendingIntent}=await import('../server/qaCorePrivateOutbox.js');
 const serverEvent={
  operationId:'qa-private-stage-replay-000001',
  documentPath:'qa_evaluations/AA100002',operation:'upsert',
  documentJson:{fields:{score:{integerValue:'85'},agent:{stringValue:'Fixture'}}},
 };
 const auth=async e=>({
  authority:'qa-core-private-authorized-mutation',
  operationId:e.operationId,documentPath:e.documentPath,
  operation:e.operation,payloadHash:e.payloadHash,
 });
 const env={QA_CORE_PRIVATE_OUTBOX_STAGING:'1',QA_PG_ISOLATED_TEST:'1'};
 const first=await stageQaCorePendingIntent({pool,event:serverEvent,authorizeServerMutation:auth,env});
 assert.equal(first.replay,false);
 const same=await stageQaCorePendingIntent({pool,event:{
  ...serverEvent,documentJson:{fields:{agent:{stringValue:'Fixture'},score:{integerValue:'85'}}}
 },authorizeServerMutation:auth,env});
 assert.equal(same.replay,true);
 await assert.rejects(stageQaCorePendingIntent({pool,event:{
  ...serverEvent,documentJson:{fields:{score:{integerValue:'84'},agent:{stringValue:'Fixture'}}}
 },authorizeServerMutation:auth,env}),/qa_outbox_idempotency_collision/);
 const untouched=await pool.query('SELECT source_state,delivery_state FROM '+table+
  ' WHERE operation_id=$1',[serverEvent.operationId]);
 assert.deepEqual(untouched.rows[0],{source_state:'pending',delivery_state:'waiting'});
 await assert.rejects(pool.query('INSERT INTO '+table+
  ' (collection_name,document_path,operation,document_json,payload_sha256,operation_id)'+
  " VALUES ('qa_sparks','qa_sparks/x','delete',NULL,NULL,'qa-stage-event-000000002')"),
   e=>e.code==='23514');
 await pool.query("DO $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='qa_ci_unprivileged') THEN CREATE ROLE qa_ci_unprivileged NOLOGIN; END IF; END $qa$;");
 const access=(await pool.query(
  "SELECT c.relrowsecurity,c.relforcerowsecurity,"+
  " has_schema_privilege('qa_ci_unprivileged','qa_core_replication_stage','USAGE') AS public_usage"+
  " FROM pg_class c WHERE c.oid=$1::regclass",[table])).rows[0];
 assert.equal(access.relrowsecurity,true);
 assert.equal(access.relforcerowsecurity,true);
 assert.equal(access.public_usage,false);
 console.log('PASS QA private outbox: isolated, RLS, idempotent, no unconfirmed delivery, synthetic lease+ack; ZERO source reads');
}finally{await pool.end();}
