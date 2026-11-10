// PostgreSQL transaction adapter for ISOLATED LOCAL TEST DATA ONLY.
// It is not attached to an HTTP route, user browser or production database.
// Caller injects an authenticated server context and a PostgreSQL Pool.
import { createHash } from 'node:crypto';
import { prepareQaCutoverWrite, verifyQaCutoverServerSession, QaCutoverBlocked } from './qaCutoverWritePolicy.js';

const intentHash = (request, actor) => createHash('sha256')
  .update(JSON.stringify([request.action, request.evaluationId, request.expectedVersion, actor, request.record ?? null]))
  .digest('hex');

export async function stageQaEvaluationWrite(pool, request, verifiedServerContext) {
  const actor = verifyQaCutoverServerSession(verifiedServerContext);
  if (verifiedServerContext.environment !== 'isolated-local-fixture'
      || verifiedServerContext.fixtureAuthorizedByServer !== true
      || verifiedServerContext.production !== false) {
    throw new QaCutoverBlocked('staging_only');
  }
  if (typeof request?.operationId !== 'string' || request.operationId.length > 180
      || !/^[A-Za-z0-9_.:@-]+$/.test(request.operationId)) {
    throw new QaCutoverBlocked('invalid_operation_id');
  }
  const digest = intentHash(request, actor);
  const client = await pool.connect();
  let open = false;
  try {
    await client.query('BEGIN');
    open = true;
    const previousOperation = await client.query(
      'SELECT request_hash, evaluation_id, response FROM qa_cutover_stage.operations WHERE operation_id = $1 FOR UPDATE',
      [request.operationId],
    );
    if (previousOperation.rows.length) {
      const saved = previousOperation.rows[0];
      if (saved.request_hash !== digest || saved.evaluation_id !== request.evaluationId)
        throw new QaCutoverBlocked('operation_reuse_conflict');
      await client.query('COMMIT');
      open = false;
      return { ...saved.response, replay: true };
    }

    const snapshot = await client.query(
      'SELECT evaluation_id, record, version FROM qa_cutover_stage.evaluations WHERE evaluation_id = $1 FOR UPDATE',
      [request.evaluationId],
    );
    const previous = snapshot.rows[0] || null;
    // User-supplied context.currentRecord/currentVersion are ignored. The
    // authoritative record is fetched while holding the PostgreSQL row lock.
    const trusted = {
      ...verifiedServerContext,
      currentRecord: previous ? previous.record : null,
      currentVersion: previous ? Number(previous.version) : null,
    };
    const prepared = prepareQaCutoverWrite(request, trusted);
    if (prepared.operationHash !== digest) throw new QaCutoverBlocked('intent_hash_mismatch');
    const value = JSON.stringify(prepared.value);
    if (prepared.action === 'create') {
      await client.query(
        'INSERT INTO qa_cutover_stage.evaluations(evaluation_id,record,version,updated_at) VALUES($1,$2::jsonb,$3,now())',
        [prepared.evaluationId,value,prepared.nextVersion],
      );
    } else {
      const result = await client.query(
        'UPDATE qa_cutover_stage.evaluations SET record=$3::jsonb,version=$4,updated_at=now() WHERE evaluation_id=$1 AND version=$2 RETURNING evaluation_id',
        [prepared.evaluationId,prepared.expectedVersion,value,prepared.nextVersion],
      );
      if (result.rowCount !== 1) throw new QaCutoverBlocked('stale_version');
    }

    const result = {
      ok: true, evaluationId: prepared.evaluationId,
      version: prepared.nextVersion, action: prepared.action,
    };
    const logged = await client.query(
      'INSERT INTO qa_cutover_stage.operations(operation_id,request_hash,evaluation_id,response,created_at) VALUES($1,$2,$3,$4::jsonb,now()) ON CONFLICT DO NOTHING RETURNING operation_id',
      [prepared.operationId,digest,prepared.evaluationId,JSON.stringify(result)],
    );
    if (logged.rowCount !== 1) throw new QaCutoverBlocked('operation_race_retry');
    await client.query(
      'INSERT INTO qa_cutover_stage.audit(operation_id,evaluation_id,version,created_at) VALUES($1,$2,$3,now())',
      [prepared.operationId,prepared.evaluationId,prepared.nextVersion],
    );
    await client.query('COMMIT');
    open = false;
    return { ...result, replay: false };
  } catch (error) {
    if (open) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
