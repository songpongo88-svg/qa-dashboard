import assert from 'node:assert/strict';
import {createQaStandbyTrustedContextFactory} from '../server/qaStandbyTrustedContext.js';

const now=Date.now(),ago=s=>new Date(now-s*1000).toISOString(),later=s=>new Date(now+s*1000).toISOString();
const actor={
  source:'verified-local-session',username:'qa_editor',
  role:'Quality Assurance',status:'active',
  verifiedAt:ago(5),expiresAt:later(3600),
  sourceSnapshotId:'qa-source-20261113-01',generation:2,
};
let primary={
  health:'quota-exhausted',verifiedByServer:true,checkedAt:ago(5),
  outageStartedAt:ago(20),
};
let mirror={
  sourceComplete:true,identityHashVerified:true,syncStatus:'validated',
  datasets:['qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_user_profiles','qa_role_permissions','qa_user_sessions',
    'qa_user_session_controls','qa_role_definitions','qa_system_settings',
    'qa_signature_library','qa_evaluation_progress'],
  verifiedAt:ago(35),snapshotId:'qa-source-20261113-01',
};
let bridge={
  databaseConnected:true,readOnly:false,authenticated:true,durableIngress:true,
  checkedAt:ago(5),
};
let lease={
  owner:'qa-failover-coordinator',approved:true,generation:2,
  grantedAt:ago(5),expiresAt:later(60),
};
let lock={
  source:'trusted-server',verified:true,agentName:'Example Agent',
  monthKey:'2026-11',signatureLocked:false,appealHold:false,checkedAt:ago(5),
};
let permission=true,leaseAllowed=true,recordFound=true,readCount=0;
let pgState={mode:'standby',generation:2,active_snapshot_id:'qa-source-20261113-01',source_snapshot_verified:true,write_frozen:false};
const readPool={
  async query(sql,params){
    readCount++;
    if(sql.includes('active_snapshot_id,source_snapshot_verified'))return {rows:[pgState]};
    if(sql.includes('qa_failover_v1.evaluations')){
      assert.deepEqual(params,['qa-001']);
      return {rows:recordFound?[{record:{id:'qa-001',agentName:'Example Agent',evaluationMonthKey:'2026-11',finalScore:80}}]:[]};
    }
    if(sql.includes('qa_failover_v1.outbox'))return {rows:[{status:'pending',n:2}]};
    throw Error('unsupported SQL');
  },
};
const factory=createQaStandbyTrustedContextFactory({
  readPool,
  primaryHealth:async()=>primary,
  mirrorProof:async()=>mirror,
  bridgeProof:async()=>bridge,
  coordinatorLease:async()=>lease,
  signatureAndAppealLocks:async()=>lock,
  productionAuthorization:async()=>permission,
  editLease:async()=>leaseAllowed?{
    source:'trusted-server',verified:true,valid:true,
    username:'qa_editor',evaluationId:'qa-001',
  }:null,
});
const request={
  actor,action:'update',evaluationId:'qa-001',
  candidate:{
    // Browser tries to overwrite original scope. Must not be trusted.
    record:{id:'qa-001',agentName:'Forged Agent',
      evaluationMonthKey:'2024-01',finalScore:99},
  },
};
const ctx=await factory(request);
assert.equal(ctx.contextSource,'server-owned-not-request-body');
assert.equal(ctx.serverSessionValidator,'qa-trusted-backend-v1');
assert.equal(ctx.failover.identity.username,'qa_editor');
assert.equal(ctx.failover.identity.serverAuthenticated,true);
assert.equal(ctx.failover.productionApprovedByServer,true);
assert.deepEqual(ctx.authoritativeScope,{agentName:'Example Agent',monthKey:'2026-11'});
assert.equal(ctx.authoritativeLocks.agentName,'Example Agent');
assert.equal(ctx.editLease.valid,true);
assert.equal(Object.isFrozen(ctx),true);
assert.ok(readCount>=2);
let failures=0;
async function denied(reason,attempt=request){
  await assert.rejects(factory(attempt),e=>{
    if(e?.code!==reason)throw e;failures++;return true;
  });
}
await denied('local_session_not_verified',{...request,actor:{...actor,role:'Senior'}});
await denied('local_session_not_verified',{...request,actor:{...actor,source:'from-browser'}});
await denied('local_session_not_verified',{...request,actor:{...actor,expiresAt:ago(10)}});
recordFound=false;await denied('authoritative_record_missing');recordFound=true;
lock={...lock,agentName:'Forged Agent'};await denied('monthly_lock_scope_mismatch');
lock={...lock,agentName:'Example Agent',signatureLocked:true};await denied('monthly_locks_unverified');
lock={...lock,signatureLocked:false};
pgState={...pgState,active_snapshot_id:'qa-source-20261113-02'};
await denied('standby_epoch_or_snapshot_changed');
pgState={...pgState,active_snapshot_id:'qa-source-20261113-01'};
pgState={...pgState,generation:3};
await denied('standby_epoch_or_snapshot_changed');
pgState={...pgState,generation:2};
pgState={...pgState,write_frozen:true};
await denied('standby_epoch_or_snapshot_changed');
pgState={...pgState,write_frozen:false};
pgState={...pgState,source_snapshot_verified:false};
await denied('standby_epoch_or_snapshot_changed');
pgState={...pgState,source_snapshot_verified:true};
mirror={...mirror,snapshotId:'qa-source-20261113-02'};
await denied('standby_epoch_or_snapshot_changed');
mirror={...mirror,snapshotId:'qa-source-20261113-01'};
await denied('standby_epoch_or_snapshot_changed',{...request,actor:{...actor,generation:3}});
leaseAllowed=false;await denied('edit_lease_unverified');leaseAllowed=true;
permission=false;await denied('failover_not_authorized');permission=true;
mirror={...mirror,sourceComplete:false};await denied('failover_not_authorized');
mirror={...mirror,sourceComplete:true};
primary={...primary,verifiedByServer:false};await denied('failover_not_authorized');
primary={...primary,verifiedByServer:true};
bridge={...bridge,readOnly:true};await denied('failover_not_authorized');
bridge={...bridge,readOnly:false};
lease={...lease,approved:false};await denied('failover_not_authorized');
lease={...lease,approved:true};
await denied('invalid_evaluation_id',{...request,evaluationId:'../unsafe'});
assert.throws(()=>createQaStandbyTrustedContextFactory({
  readPool,primaryHealth:async()=>primary,
}),/trusted_sources_missing/);
console.log('PASS QA standby trusted context: independent source proof, active QA session, original scope, lock/lease, coordinator gate, no browser privilege assertions; '+failures+' denials');
