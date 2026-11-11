// QA standby -> Firestore replay queue. The adapter MUST perform an
// idempotent Firestore transaction that rejects changed originals, locked
// months, revoked sessions, deleted accounts and conflicting revisions.
// This worker never connects to Firestore on its own and is OFF by default.
import { QaStandbyBlocked } from './qaStandbyPgJournal.js';

const blocked = code => { throw new QaStandbyBlocked(code); };
const SQL_SELECT = `
 SELECT o.operation_id,o.evaluation_id,o.action,o.actor_username,o.base_version,
        o.next_version,o.request_hash,o.source_base_hash,o.record
 FROM qa_failover_v1.outbox o
 WHERE o.status='pending'
   AND NOT EXISTS (
    SELECT 1 FROM qa_failover_v1.outbox older
    WHERE older.evaluation_id=o.evaluation_id AND
      (older.created_at,older.operation_id)<(o.created_at,o.operation_id) AND
      older.status IN ('pending','in_flight','conflict')
   )
 ORDER BY o.created_at,o.operation_id
 LIMIT 1 FOR UPDATE OF o SKIP LOCKED
`;

async function allowReplay(pool, trusted) {
  if(trusted?.mode==='isolated-fixture' && trusted?.fixtureAuthorizedByServer===true &&
    process.env.QA_PG_ISOLATED_TEST==='1') {
    const db=await pool.query('SELECT current_database() AS db');
    if(db.rows[0]?.db==='qa_cutover_ci_test')return;
  }
  if(trusted?.mode!=='approved-server-replay' || trusted?.serverAuthority!=='qa-server-verified' ||
    trusted?.productionApprovedByServer!==true ||
    process.env.QA_FAILBACK_REPLAY_ENABLED!=='1' ||
    trusted?.primaryHealth?.verifiedByServer!==true ||
    trusted?.primaryHealth?.health!=='healthy')blocked('replay_disabled');
}

export async function replayOneQaStandbyOperation(pool, adapter, trusted) {
  await allowReplay(pool,trusted);
  if(!adapter || typeof adapter.applyIfVersionMatches!=='function')blocked('missing_firestore_adapter');
  const client=await pool.connect();
  let op=null;
  try{
    await client.query('BEGIN');
    // A stale in-flight claim is returned to the queue for safe retry.
    // The Firestore adapter MUST dedupe by operation_id if a prior remote
    // commit succeeded but the response was lost.
    await client.query(`
      UPDATE qa_failover_v1.outbox SET status='pending',claimed_at=null,error_code=null
      WHERE status='in_flight' AND claimed_at < now()-interval '10 minutes'`);
    const state=await client.query('SELECT mode,write_frozen FROM qa_failover_v1.state WHERE id=1 FOR UPDATE');
    if(!state.rows[0] || state.rows[0].mode!=='reconciling' || state.rows[0].write_frozen!==true)
      blocked('standby_must_be_frozen_for_replay');
    const selected=await client.query(SQL_SELECT);
    if(!selected.rows.length){await client.query('COMMIT');return {ok:true,processed:false};}
    op=selected.rows[0];
    const updated=await client.query(
      `UPDATE qa_failover_v1.outbox SET status='in_flight',claimed_at=now(),attempts=attempts+1
       WHERE operation_id=$1 AND status='pending' RETURNING operation_id`,[op.operation_id]);
    if(updated.rowCount!==1)blocked('claim_lost');
    await client.query('COMMIT');
  }catch(error){
    try{await client.query('ROLLBACK');}catch{/* original error wins */}
    throw error;
  }finally{client.release();}
  // All network calls happen AFTER releasing local DB row locks.
  // Firestore transaction sees exact original hash + operation id.
  let outcome;
  try {
    outcome=await adapter.applyIfVersionMatches({
      operationId:op.operation_id,
      evaluationId:op.evaluation_id,
      action:op.action,
      actorUsername:op.actor_username,
      baseVersion:Number(op.base_version),
      nextVersion:Number(op.next_version),
      sourceBaseHash:op.source_base_hash,
      record:op.record,
    });
  }catch{
    // Unknown network outcome: queue for idempotent retry, never mark synced.
    await pool.query(`
      UPDATE qa_failover_v1.outbox SET status='pending',claimed_at=null,error_code='remote_result_unknown'
      WHERE operation_id=$1 AND status='in_flight'`,[op.operation_id]);
    return {ok:false,processed:true,retry:true};
  }
  if(!outcome || !['applied','already_applied','conflict','retry'].includes(outcome.status))
    blocked('unsafe_firestore_adapter_result');
  if(outcome.status==='applied'||outcome.status==='already_applied') {
    if(typeof outcome.remoteRevision!=='string'||!outcome.remoteRevision)
      blocked('remote_revision_not_verified');
    await pool.query(`
      UPDATE qa_failover_v1.outbox
      SET status='synced',claimed_at=null,error_code=null,synced_at=now(),remote_revision=$2
      WHERE operation_id=$1 AND status='in_flight'`,[op.operation_id,outcome.remoteRevision]);
    return {ok:true,processed:true,operationId:op.operation_id,synced:true};
  }
  if(outcome.status==='conflict') {
    await pool.query(`
      UPDATE qa_failover_v1.outbox
      SET status='conflict',claimed_at=null,error_code='primary_revision_conflict'
      WHERE operation_id=$1 AND status='in_flight'`,[op.operation_id]);
    return {ok:false,processed:true,operationId:op.operation_id,conflict:true};
  }
  await pool.query(`
    UPDATE qa_failover_v1.outbox SET status='pending',claimed_at=null,error_code='primary_unavailable'
    WHERE operation_id=$1 AND status='in_flight'`,[op.operation_id]);
  return {ok:false,processed:true,retry:true};
}
