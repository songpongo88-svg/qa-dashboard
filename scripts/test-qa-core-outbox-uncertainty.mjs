// In-memory control test: uncertain Firestore writes cannot be delivered.
import assert from 'node:assert/strict';
import {quarantineUncertainQaCoreMutation} from '../server/qaCoreOutboxUncertainty.js';
const id='qa-test-uncertain-operation-1';
let touched=0,state='pending';
const pool={async connect(){return {release(){},async query(sql){
 touched++;
 if(sql==='SELECT current_database() AS db')return {rows:[{db:'qa_cutover_ci_test'}]};
 if(sql.startsWith('UPDATE qa_core_replication_stage.change_outbox')){
  if(state==='pending'){state='needs_reconcile';return {rows:[{operation_id:id}]};}
  return {rows:[]};
 }
 if(sql.startsWith('SELECT source_state,delivery_state')){
  return {rows:[{source_state:state,delivery_state:state==='needs_reconcile'?'blocked':'ready'}]};
 }
 throw Error('unexpected sql');
}};}};
const env={QA_PG_ISOLATED_TEST:'1',QA_CORE_PRIVATE_OUTBOX_STAGING:'1'};
const attest=async operationId=>({
 authority:'qa-core-private-uncertain-outcome',
 operationId,sourceCommitProven:false,
});
await assert.rejects(quarantineUncertainQaCoreMutation({pool,
 operationId:id,authorizeUncertainOutcome:attest,
 env:{...env,QA_CORE_PRIVATE_OUTBOX_STAGING:'0'}}),
 /qa_outbox_private_stage_disabled/);
await assert.rejects(quarantineUncertainQaCoreMutation({pool,
 operationId:id,authorizeUncertainOutcome:async()=>({authority:'browser'}),
 env}),/qa_outbox_uncertainty_attestation_required/);
assert.equal(touched,0);
const first=await quarantineUncertainQaCoreMutation({pool,operationId:id,
 authorizeUncertainOutcome:attest,env});
assert.equal(first.quarantined,true);assert.equal(first.sourceConfirmed,false);
assert.equal(first.delivered,false);
const replay=await quarantineUncertainQaCoreMutation({pool,operationId:id,
 authorizeUncertainOutcome:attest,env});
assert.equal(replay.replay,true);
state='source_confirmed';
await assert.rejects(quarantineUncertainQaCoreMutation({pool,operationId:id,
 authorizeUncertainOutcome:attest,env}),
 /qa_outbox_uncertainty_transition_blocked/);
console.log('PASS private QA uncertainty: blocked until source reconciliation, no false commit or delivery');
