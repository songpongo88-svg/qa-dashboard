// INTERNAL STAGING ONLY: intent-first QA mutation orchestration.
// Not imported by the Dashboard or any API. No credentials, routes, timers,
// Firestore clients, automatic retries, Windows sender or failover activation.
// A successful server write is NOT independent source confirmation.
import {normalizeQaCoreIntent,stageQaCorePendingIntent}
 from './qaCorePrivateOutbox.js';
import {quarantineUncertainQaCoreMutation}
 from './qaCoreOutboxUncertainty.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function stageQaCoreMutationCoordinator({
 pool,event,authorizeServerMutation,performTrustedSourceWrite,
 attestUncertainOutcome,env=process.env,
 stageIntent=stageQaCorePendingIntent,
 quarantine=quarantineUncertainQaCoreMutation,
}={}){
 if(env.QA_CORE_MUTATION_COORDINATOR_STAGE!=='1'||
    env.QA_CORE_PRIVATE_OUTBOX_STAGING!=='1'||
    env.QA_FAILOVER!=='OFF'||
    typeof pool?.connect!=='function'||
    typeof authorizeServerMutation!=='function'||
    typeof performTrustedSourceWrite!=='function'||
    typeof attestUncertainOutcome!=='function'||
    typeof stageIntent!=='function'||typeof quarantine!=='function')
  fail('qa_core_mutation_coordinator_disabled');
 const accepted=normalizeQaCoreIntent(event);
 // A current Firestore 404 is not an authoritative deletion tombstone.
 // Do not add delete handling until delete revision ordering is proved.
 if(accepted.operation!=='upsert')
  fail('qa_core_mutation_delete_not_yet_safe');
 // A separately implemented private backend must validate the authenticated
 // principal, actual source roles/sessions, month locks and edit leases.
 // This stage NEVER trusts a browser-provided role, proof or success flag.
 const saved=await stageIntent({
  pool,event,authorizeServerMutation,env,
 });
 if(saved?.staged!==true||
    saved?.sourceConfirmed!==false||saved?.delivered!==false||
    saved?.failoverReady!==false)
  fail('qa_core_mutation_intent_receipt_untrusted');
 // An idempotent retry must NOT trigger another Firestore mutation when an
 // earlier attempt may have committed but its acknowledgment was lost.
 if(saved.replay===true){
  return Object.freeze({
   status:'PENDING_SOURCE_RECONCILIATION_NO_REPLAY',
   sourceOutcome:'unknown',sourceConfirmed:false,
   delivered:false,failoverReady:false,
  });
 }
 if(saved.replay!==false)
  fail('qa_core_mutation_intent_replay_state_invalid');
 try{
  // Invoked only by the future trusted backend, NEVER the browser.
  // This adapter must itself enforce Firestore transaction preconditions.
  await performTrustedSourceWrite(Object.freeze({
   operationId:accepted.operationId,documentPath:accepted.documentPath,
   collection:accepted.collection,operation:accepted.operation,
   payloadHash:accepted.payloadHash,
   documentJson:accepted.documentJson,
  }));
  // Even a resolved SDK promise does not create a durable, source-verified
  // replication record or guarantee absence of concurrent writes.
  return Object.freeze({
   status:'SOURCE_ATTEMPT_RECORDED_CONFIRMATION_PENDING',
   sourceOutcome:'verification_required',sourceConfirmed:false,
   delivered:false,failoverReady:false,
  });
 }catch{
  // Timeout is not evidence of source rejection. Quarantine before
  // returning; never auto-retry the source write.
  const q=await quarantine({
   pool,operationId:accepted.operationId,
   authorizeUncertainOutcome:attestUncertainOutcome,env,
  });
  if(q?.quarantined!==true||q.sourceConfirmed!==false||
     q.delivered!==false||q.failoverReady!==false)
   fail('qa_core_mutation_uncertainty_not_quarantined');
  return Object.freeze({
   status:'SOURCE_OUTCOME_UNCERTAIN_QUARANTINED',
   sourceOutcome:'unknown',sourceConfirmed:false,
   delivered:false,failoverReady:false,
  });
 }
}
