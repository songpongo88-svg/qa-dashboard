// Isolated PostgreSQL 17 coordinator integration with synthetic source writes.
// No Firestore API, no production QA, no Windows, no attached credentials.
import assert from 'node:assert/strict';
import pg from 'pg';
import {stageQaCoreMutationCoordinator}
 from '../server/qaCoreMutationCoordinatorStage.js';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_disposable_database_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const env={
 QA_CORE_MUTATION_COORDINATOR_STAGE:'1',
 QA_CORE_PRIVATE_OUTBOX_STAGING:'1',
 QA_PG_ISOLATED_TEST:'1',QA_FAILOVER:'OFF',
};
const auth=async e=>({
 authority:'qa-core-private-authorized-mutation',
 operationId:e.operationId,documentPath:e.documentPath,
 operation:e.operation,payloadHash:e.payloadHash,
});
const uncertain=async id=>({
 authority:'qa-core-private-uncertain-outcome',
 operationId:id,sourceCommitProven:false,
});
const writeEvent=(id)=>({
 operationId:id,documentPath:'qa_evaluations/AA_TEST_COORDINATOR',
 operation:'upsert',
 documentJson:{fields:{finalScore:{integerValue:'85'}}},
});
const table='qa_core_replication_stage.change_outbox';
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,
  'qa_cutover_ci_test');
 let writeAttempts=0;
 const errorEvent=writeEvent('qa-coord-pg-integration-timeout-000001');
 const errorResult=await stageQaCoreMutationCoordinator({
  pool,event:errorEvent,env,authorizeServerMutation:auth,
  attestUncertainOutcome:uncertain,
  performTrustedSourceWrite:async ()=>{
   writeAttempts++;
   const r=(await pool.query('SELECT source_state,delivery_state FROM '+table+
    ' WHERE operation_id=$1',[errorEvent.operationId])).rows[0];
   assert.deepEqual(r,{source_state:'pending',delivery_state:'waiting'});
   throw Error('simulated_unknown_commit');
  },
 });
 assert.equal(errorResult.status,'SOURCE_OUTCOME_UNCERTAIN_QUARANTINED');
 assert.equal(writeAttempts,1);
 const row=(await pool.query('SELECT source_state,delivery_state FROM '+table+
  ' WHERE operation_id=$1',[errorEvent.operationId])).rows[0];
 assert.deepEqual(row,{source_state:'needs_reconcile',delivery_state:'blocked'});
 const replay=await stageQaCoreMutationCoordinator({
  pool,event:errorEvent,env,authorizeServerMutation:auth,
  attestUncertainOutcome:uncertain,
  performTrustedSourceWrite:async()=>{writeAttempts++;},
 });
 assert.equal(replay.status,'PENDING_SOURCE_RECONCILIATION_NO_REPLAY');
 assert.equal(writeAttempts,1);
 const goodEvent=writeEvent('qa-coord-pg-integration-pending-000002');
 const good=await stageQaCoreMutationCoordinator({
  pool,event:goodEvent,env,authorizeServerMutation:auth,
  attestUncertainOutcome:uncertain,
  performTrustedSourceWrite:async()=>{writeAttempts++;},
 });
 assert.equal(good.status,'SOURCE_ATTEMPT_RECORDED_CONFIRMATION_PENDING');
 const notConfirmed=(await pool.query('SELECT source_state,delivery_state FROM '+table+
  ' WHERE operation_id=$1',[goodEvent.operationId])).rows[0];
 assert.deepEqual(notConfirmed,{source_state:'pending',delivery_state:'waiting'});
 const releasable=(await pool.query('SELECT count(*)::int AS n FROM '+table+
  " WHERE operation_id=ANY($1::text[]) AND source_state='source_confirmed'"+
  " AND delivery_state IN ('ready','leased','delivered')",
  [[goodEvent.operationId,errorEvent.operationId]])).rows[0].n;
 assert.equal(releasable,0);
 console.log('PASS QA coordinator PostgreSQL17: intent precedes synthetic write, timeouts quarantined, no duplicate replay, no unverified delivery');
}finally{await pool.end();}
