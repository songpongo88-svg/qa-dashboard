// PostgreSQL 17 journal for QA evaluation failover. Not yet an HTTP route.
// Only callable by a trusted server that independently verifies the QA session,
// monthly signature locks, appeals, a live quota outage, and the coordinator lease.
// Browser-supplied role, lock, source-completeness and mode flags are NEVER trusted.
// The database write and durable replay outbox are committed in one transaction.
import { createHash } from 'node:crypto';
import { qaFailoverDecision } from './qaFailoverDecision.js';

export class QaStandbyBlocked extends Error {
  constructor(code) { super(code); this.code=code; this.name='QaStandbyBlocked'; }
}
const reject = code => { throw new QaStandbyBlocked(code); };
const validId = value => typeof value==='string' && value.length>0 && value.length<=180 && /^[a-zA-Z0-9_.:@-]+$/.test(value);
const validMonth = value => typeof value==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = value => typeof value==='string' && Number.isFinite(Date.parse(value));

async function serverContext(pool, trusted) {
  if (!trusted || typeof trusted!=='object') reject('trusted_context_missing');
  if (trusted.mode==='isolated-fixture') {
    if (process.env.QA_PG_ISOLATED_TEST!=='1' || trusted.fixtureAuthorizedByServer!==true || trusted.production!==false)
      reject('fixture_mode_denied');
    const result=await pool.query('SELECT current_database() AS database');
    if(result.rows[0]?.database!=='qa_cutover_ci_test') reject('fixture_database_denied');
    if (trusted.session?.verified!==true || trusted.session?.role!=='Quality Assurance' ||
      trusted.session?.status!=='active' || !validId(trusted.session?.username) ||
      !iso(trusted.session?.expiresAt) || Date.parse(trusted.session.expiresAt)<=Date.now())
      reject('session_not_verified');
    return { username:trusted.session.username,generation:1 };
  }
  if (trusted.mode!=='server-approved-failover' || trusted.production!==true ||
    trusted.serverSessionValidator!=='qa-trusted-backend-v1' ||
    trusted.contextSource!=='server-owned-not-request-body') reject('production_writer_disabled');
  const decision=qaFailoverDecision(trusted.failover);
  if(!decision.canAcceptWrites) reject('failover_not_authorized');
  if(!validId(trusted.failover?.identity?.username)) reject('session_not_verified');
  return {username:trusted.failover.identity.username,generation:decision.generation};
}

function validateRequest(request, trusted, actor) {
  if(!request || typeof request!=='object' || !['create','update','delete'].includes(request.action) ||
    !validId(request.operationId) || !validId(request.evaluationId) ||
    !Number.isSafeInteger(request.expectedVersion) || request.expectedVersion<0)
    reject('invalid_operation');
  if (request.action==='delete') {
    if(request.record!=null) reject('delete_must_not_override_record');
    return;
  }
  const row=request.record;
  if(!row || typeof row!=='object' || Array.isArray(row) || row.id!==request.evaluationId ||
    !validId(row.caseId) || typeof row.agentName!=='string' || !row.agentName.trim() ||
    !validMonth(row.evaluationMonthKey) || !Array.isArray(row.topics) ||
    !Number.isFinite(row.finalScore) || row.finalScore<0 || row.finalScore>100 ||
    row.evaluatorUsername!==actor || row.deletedAt)
    reject('invalid_evaluation_record');
  if (row.evaluationType && row.evaluationType!=='case') reject('unsupported_evaluation_type');
  const scope=trusted.authoritativeScope;
  if(!scope || scope.monthKey!==row.evaluationMonthKey || scope.agentName!==row.agentName)
    reject('score_scope_unverified');
}

function verifyLocks(trusted, current, next, action, actor) {
  const lock=trusted.authoritativeLocks;
  const item=action==='delete'?current:next;
  if (!item || !lock || lock.source!=='trusted-server' ||
    lock.verified!==true || lock.monthKey!==item.evaluationMonthKey ||
    lock.agentName!==item.agentName || lock.signatureLocked!==false ||
    lock.appealHold!==false || !iso(lock.checkedAt) ||
    Date.now()-Date.parse(lock.checkedAt)>120000 || Date.now()<Date.parse(lock.checkedAt))
    reject('monthly_locks_unverified');
  if (action!=='create') {
    if(trusted.editLease?.source!=='trusted-server' || trusted.editLease.verified!==true ||
      trusted.editLease.evaluationId!==current.id || trusted.editLease.username!==actor ||
      trusted.editLease.valid!==true)
      reject('edit_lease_unverified');
  }
}

export async function writeQaStandbyEvaluation(pool, request, trusted) {
  const {username:actor,generation}=await serverContext(pool,trusted);
  validateRequest(request,trusted,actor);
  const fingerprint=hash([request.action,request.evaluationId,request.expectedVersion,request.record??null,actor]);
  const client=await pool.connect();
  let tx=false;
  try {
    await client.query('BEGIN');tx=true;
    // Advisory locks: operation first, then evaluation, to keep a total order.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[ 'qa-standby-op:'+request.operationId ]);
    const prior=await client.query(
      'SELECT request_hash,evaluation_id,action,next_version,status FROM qa_failover_v1.outbox WHERE operation_id=$1 FOR UPDATE',
      [request.operationId]);
    if(prior.rows.length){
      const row=prior.rows[0];
      if(row.request_hash!==fingerprint || row.evaluation_id!==request.evaluationId || row.action!==request.action)
        reject('idempotency_key_reused');
      await client.query('COMMIT');tx=false;
      return {ok:true,operationId:request.operationId,evaluationId:request.evaluationId,version:Number(row.next_version),queued:row.status!=='synced',replay:true};
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[ 'qa-standby-evaluation:'+request.evaluationId ]);
    const state=await client.query('SELECT mode,generation,source_snapshot_verified,write_frozen FROM qa_failover_v1.state WHERE id=1 FOR UPDATE');
    const active=state.rows[0];
    if (!active || active.mode!=='standby' || active.write_frozen!==false || active.source_snapshot_verified!==true ||
      Number(active.generation)!==generation) reject('standby_not_activated');
    const stored=await client.query(
      'SELECT evaluation_id,record,version,source_hash,deleted_at FROM qa_failover_v1.evaluations WHERE evaluation_id=$1 FOR UPDATE',
      [request.evaluationId]);
    const existing=stored.rows[0]||null;
    if(request.action==='create') {
      if(existing || request.expectedVersion!==0) reject('existing_record_or_stale_create');
    } else if(!existing || existing.deleted_at || Number(existing.version)!==request.expectedVersion) {
      reject('missing_deleted_or_stale_record');
    }
    if(existing && request.action!=='delete') {
      const before=existing.record;
      const after=request.record;
      if(before.id!==after.id || before.caseId!==after.caseId || before.agentName!==after.agentName ||
        before.evaluationMonthKey!==after.evaluationMonthKey ||
        before.evaluatorUsername!==after.evaluatorUsername)
        reject('immutable_identity_changed');
    }
    const next=request.action==='delete'
      ? {...existing.record,deletedAt:new Date().toISOString()}
      : structuredClone(request.record);
    verifyLocks(trusted,existing?.record,next,request.action,actor);
    const nextVersion=request.expectedVersion+1;
    if(request.action==='create') {
      await client.query(
        `INSERT INTO qa_failover_v1.evaluations(evaluation_id,record,version,origin,source_hash,deleted_at)
          VALUES($1,$2::jsonb,$3,'standby_write',null,null)`,
        [request.evaluationId,JSON.stringify(next),nextVersion]);
    } else {
      const result=await client.query(
        `UPDATE qa_failover_v1.evaluations
         SET record=$3::jsonb,version=$4,origin='standby_write',deleted_at=$5,updated_at=now()
         WHERE evaluation_id=$1 AND version=$2 RETURNING evaluation_id`,
        [request.evaluationId,request.expectedVersion,JSON.stringify(next),nextVersion,
          request.action==='delete'?next.deletedAt:null]);
      if(result.rowCount!==1) reject('concurrent_version_conflict');
    }
    const inserted=await client.query(
      `INSERT INTO qa_failover_v1.outbox
       (operation_id,evaluation_id,action,actor_username,base_version,next_version,request_hash,source_base_hash,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT DO NOTHING RETURNING operation_id`,
      [request.operationId,request.evaluationId,request.action,actor,request.expectedVersion,nextVersion,
        fingerprint,existing?.source_hash??null,JSON.stringify(next)]);
    if(inserted.rowCount!==1)reject('operation_race');
    await client.query(
      `INSERT INTO qa_failover_v1.audit
       (operation_id,evaluation_id,actor_username,action,next_version) VALUES($1,$2,$3,$4,$5)`,
      [request.operationId,request.evaluationId,actor,request.action,nextVersion]);
    await client.query('COMMIT');tx=false;
    return {ok:true,operationId:request.operationId,evaluationId:request.evaluationId,version:nextVersion,queued:true,replay:false};
  } catch(error) {
    if(tx) await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}

// A verified server worker may inspect queued operations. It must reconcile
// them with Firestore using exact source version/hash and mark conflicts for
// human review; it must never overwrite a changed primary document silently.
export async function getQaStandbyOutboxCounts(pool) {
  const result=await pool.query(
    `SELECT status,count(*)::integer AS count FROM qa_failover_v1.outbox GROUP BY status`);
  return Object.fromEntries(['pending','in_flight','synced','conflict'].map(key=>[
    key,Number(result.rows.find(row=>row.status===key)?.count||0)]));
}
