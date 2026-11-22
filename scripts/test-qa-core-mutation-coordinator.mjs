import assert from 'node:assert/strict';
import {stageQaCoreMutationCoordinator}
 from '../server/qaCoreMutationCoordinatorStage.js';
const event={operationId:'qa-coordinator-op-20261120-0001',
 documentPath:'qa_evaluations/AA000001',operation:'upsert',
 documentJson:{fields:{finalScore:{integerValue:'85'}},
  updateTime:'2026-11-20T07:00:00.123456Z'}};
const env={QA_CORE_MUTATION_COORDINATOR_STAGE:'1',
 QA_CORE_PRIVATE_OUTBOX_STAGING:'1',QA_FAILOVER:'OFF'};
let stages=0,writes=0,quarantines=0;
const pool={connect(){}};
const authorizeServerMutation=async()=>({authority:'not_called_in_fixture'});
const attestUncertainOutcome=async()=>({authority:'qa-core-private-uncertain-outcome'});
const stageIntent=async()=>{stages++;return{
 staged:true,replay:false,sourceConfirmed:false,delivered:false,failoverReady:false}};
const performTrustedSourceWrite=async request=>{writes++;
 assert.equal(request.operationId,event.operationId);
 assert.equal(request.documentPath,event.documentPath);
 assert.ok(/^[0-9a-f]{64}$/.test(request.payloadHash));
};
const quarantine=async()=>{quarantines++;return{
 quarantined:true,sourceConfirmed:false,delivered:false,failoverReady:false}};
const common={pool,event,env,authorizeServerMutation,attestUncertainOutcome,
 stageIntent,performTrustedSourceWrite,quarantine};
await assert.rejects(stageQaCoreMutationCoordinator({...common,
 env:{...env,QA_FAILOVER:'ON'}}),/qa_core_mutation_coordinator_disabled/);
assert.equal(stages,0);assert.equal(writes,0);
await assert.rejects(stageQaCoreMutationCoordinator({...common,
 event:{...event,operation:'delete',documentJson:null}}),
 /qa_core_mutation_delete_not_yet_safe/);
assert.equal(stages,0);assert.equal(writes,0);
const success=await stageQaCoreMutationCoordinator(common);
assert.equal(success.status,'SOURCE_ATTEMPT_RECORDED_CONFIRMATION_PENDING');
assert.equal(success.sourceConfirmed,false);assert.equal(success.delivered,false);
assert.equal(writes,1);assert.equal(stages,1);
const replay=await stageQaCoreMutationCoordinator({...common,
 stageIntent:async()=>({staged:true,replay:true,sourceConfirmed:false,
 delivered:false,failoverReady:false})});
assert.equal(replay.status,'PENDING_SOURCE_RECONCILIATION_NO_REPLAY');
assert.equal(writes,1);
await assert.rejects(stageQaCoreMutationCoordinator({...common,
 stageIntent:async()=>{throw Error('private DB unavailable')}}),
 /private DB unavailable/);
assert.equal(writes,1);
const uncertain=await stageQaCoreMutationCoordinator({...common,
 performTrustedSourceWrite:async()=>{writes++;throw Error('source timeout')}});
assert.equal(uncertain.status,'SOURCE_OUTCOME_UNCERTAIN_QUARANTINED');
assert.equal(quarantines,1);assert.equal(writes,2);
await assert.rejects(stageQaCoreMutationCoordinator({...common,
 performTrustedSourceWrite:async()=>{throw Error('source timeout')},
 quarantine:async()=>{throw Error('cannot quarantine')}}),
 /cannot quarantine/);
assert.equal(quarantines,1);
await assert.rejects(stageQaCoreMutationCoordinator({...common,
 stageIntent:async()=>({staged:true,replay:false,sourceConfirmed:true,
 delivered:false,failoverReady:false})}),
 /qa_core_mutation_intent_receipt_untrusted/);
console.log('PASS mutation coordinator stage: intent before write, no replay, uncertain quarantine, delete blocked, failover OFF');
