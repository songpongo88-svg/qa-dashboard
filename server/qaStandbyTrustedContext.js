// QA-only server-side trusted context builder for future local PostgreSQL
// failover. Not attached to any route. FAIL-CLOSED unless every independent
// server-only source proves quota outage, complete live mirror, private writer,
// local session, per-month locks and exclusive coordinator ownership.
// Never construct these sources from a browser body or a cached QA report.
import { qaFailoverDecision } from './qaFailoverDecision.js';

const blocked=code=>Object.assign(new Error(code),{code});
const id=/^[a-zA-Z0-9_.:@-]{1,180}$/;
const month=/^\d{4}-(0[1-9]|1[0-2])$/;
const valid=(s)=>typeof s==='string'&&id.test(s);
const originalScope=(item)=>item && {
  agentName:String(item.agentName||''),
  monthKey:String(item.evaluationMonthKey||''),
};
const callbackNames=[
  'primaryHealth','mirrorProof','bridgeProof','coordinatorLease',
  'signatureAndAppealLocks','editLease','productionAuthorization',
];

export function createQaStandbyTrustedContextFactory({
  readPool,primaryHealth,mirrorProof,bridgeProof,coordinatorLease,
  signatureAndAppealLocks,editLease,productionAuthorization,
}={}){
  if(!readPool||typeof readPool.query!=='function'||
    callbackNames.some(k=>typeof ({
      primaryHealth,mirrorProof,bridgeProof,coordinatorLease,
      signatureAndAppealLocks,editLease,productionAuthorization,
    })[k]!=='function'))throw blocked('trusted_sources_missing');

  return async({actor,action,evaluationId,candidate}={})=>{
    if(!actor||actor.source!=='verified-local-session'||
      actor.role!=='Quality Assurance'||actor.status!=='active'||
      !valid(actor.username)||!Number.isFinite(Date.parse(actor.expiresAt))||
      Date.parse(actor.expiresAt)<=Date.now()||
      !Number.isFinite(Date.parse(actor.verifiedAt))||
      Date.now()-Date.parse(actor.verifiedAt)>120000||
      Date.parse(actor.verifiedAt)>Date.now())throw blocked('local_session_not_verified');
    if(!['get','list','create','update','delete'].includes(action))
      throw blocked('invalid_action');
    if(action!=='list'&&!valid(evaluationId))throw blocked('invalid_evaluation_id');

    // On edits and deletions the scope MUST come from an existing
    // independently read PG record, not candidate.record.agentName.
    const row=action==='list'||action==='create'?null:
      (await readPool.query('SELECT record FROM qa_failover_v1.evaluations WHERE evaluation_id=$1 AND deleted_at IS NULL',[evaluationId])).rows?.[0];
    if(['update','delete','get'].includes(action)&&!row)
      throw blocked('authoritative_record_missing');
    const oldScope=originalScope(row?.record);
    const newScope=action==='create'?originalScope(candidate?.record):null;
    const scope=oldScope||newScope;
    if(action!=='list'&&(!scope?.agentName?.trim()||!month.test(scope?.monthKey||'')))
      throw blocked('scope_unverified');

    // A newly verified browser session is NOT sufficient after coordinator
    // rotation: every request must still refer to exactly the active PG
    // snapshot and generation. Neither value may come from request JSON.
    const [primary,mirror,bridge,lease,approval,queue,pgState]=await Promise.all([
      primaryHealth(),mirrorProof(),bridgeProof(),coordinatorLease(),
      productionAuthorization(),
      readPool.query("SELECT status,count(*)::integer AS n FROM qa_failover_v1.outbox GROUP BY status"),
      readPool.query("SELECT mode,generation,active_snapshot_id,source_snapshot_verified,"+
        "write_frozen FROM qa_failover_v1.state WHERE id=1"),
    ]);
    const state=pgState.rows?.[0];
    if(state?.mode!=='standby'||state.source_snapshot_verified!==true||
       state.write_frozen!==false||
       typeof state.active_snapshot_id!=='string'||
       state.active_snapshot_id!==actor.sourceSnapshotId||
       state.active_snapshot_id!==mirror?.snapshotId||
       !Number.isSafeInteger(Number(state.generation))||
       Number(state.generation)!==actor.generation||
       Number(state.generation)!==lease?.generation)
      throw blocked('standby_epoch_or_snapshot_changed');
    const unresolvedConflicts=Number(queue.rows?.find(r=>r.status==='conflict')?.n||0);
    if(!Number.isSafeInteger(unresolvedConflicts)||unresolvedConflicts<0)
      throw blocked('unverified_backlog');

    const lock=await signatureAndAppealLocks({actor,action,scope});
    // Signature/appeal state must be verified independently and must not
    // be inferred from browser request or source archive "readOnly" flag.
    if(!lock||lock.source!=='trusted-server'||lock.verified!==true||
      lock.signatureLocked!==false||lock.appealHold!==false||
      !Number.isFinite(Date.parse(lock.checkedAt))||
      Date.now()-Date.parse(lock.checkedAt)>120000||
      Date.parse(lock.checkedAt)>Date.now())
      throw blocked('monthly_locks_unverified');
    if(scope&&(lock.agentName!==scope.agentName||lock.monthKey!==scope.monthKey))
      throw blocked('monthly_lock_scope_mismatch');

    const identity={
      serverAuthenticated:true,role:'Quality Assurance',status:'active',
      username:actor.username,verifiedAt:actor.verifiedAt,expiresAt:actor.expiresAt,
    };
    const failover={
      serverAuthority:'qa-server-verified',production:true,
      productionApprovedByServer:approval===true,
      primary,mirror,bridge,lease,identity,
      locks:{verifiedByServer:true,signatureLocked:false,appealHold:false,
        verifiedAt:lock.checkedAt},
      backlog:{unresolvedConflicts},
      manualDisable:approval!==true,
    };
    const decision=qaFailoverDecision(failover);
    if(!decision.canAcceptWrites)throw blocked('failover_not_authorized');

    const verifiedLease=action==='update'||action==='delete'
      ? await editLease({actor,action,evaluationId,record:row.record})
      : null;
    if((action==='update'||action==='delete')&&(
      verifiedLease?.source!=='trusted-server'||
      verifiedLease?.verified!==true||verifiedLease?.valid!==true||
      verifiedLease?.username!==actor.username||
      verifiedLease?.evaluationId!==evaluationId))
      throw blocked('edit_lease_unverified');

    return Object.freeze({
      mode:'server-approved-failover',
      sourceSnapshotId:state.active_snapshot_id,
      coordinatorGeneration:Number(state.generation),
      production:true,
      productionApprovedByServer:true,
      serverAuthority:'qa-server-verified',
      serverSessionValidator:'qa-trusted-backend-v1',
      contextSource:'server-owned-not-request-body',
      failover,
      authoritativeScope:scope||null,
      authoritativeLocks:{
        source:'trusted-server',verified:true,
        signatureLocked:false,appealHold:false,
        agentName:scope?.agentName||null,monthKey:scope?.monthKey||null,
        checkedAt:lock.checkedAt,
      },
      editLease:verifiedLease,
    });
  };
}
