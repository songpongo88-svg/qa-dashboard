// Server-only policy for the future PostgreSQL QA Evaluation writer.
// IMPORTANT: Caller MUST construct the context from trusted server-side session,
// signature-lock, edit-lease and source-parity checks. Never pass req.body as context.
// This module does not execute database writes or enable a production cutover.
import { createHash } from 'node:crypto';

export class QaCutoverBlocked extends Error {
  constructor(code) {
    super(code);
    this.name = 'QaCutoverBlocked';
    this.code = code;
  }
}

const fail = (code) => { throw new QaCutoverBlocked(code); };
const plain = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validId = (value) => typeof value === 'string'
  && value.length >= 1 && value.length <= 180
  && /^[A-Za-z0-9_.:@-]+$/.test(value);
const dateMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const scopeKey = (scope) => `${scope.agentName.trim().toLowerCase()}::${scope.monthKey}`;
const sha = (value) => createHash('sha256').update(value).digest('hex');

// Operation ID is unique for a *single user intent*, and cannot be reused
// with different content. Database layer must use a UNIQUE constraint too.
export function prepareQaCutoverWrite(request, trusted) {
  if (!plain(request) || !plain(trusted)) fail('invalid_request');
  if (trusted.verificationSource !== 'trusted-server-session-validator'
      || trusted.session?.verified !== true
      || trusted.session?.status !== 'active'
      || trusted.session?.role !== 'Quality Assurance'
      || !validId(trusted.session?.username)
      || !Number.isFinite(Date.parse(trusted.session?.expiresAt))
      || Date.parse(trusted.session.expiresAt) <= Date.now())
    fail('session_not_verified');

  // The public browser must never be able to assert source parity.
  // Synthetic local-only tests can be authorized by the trusted runtime, not
  // by a user-submitted record.isTestCase or request.mode field.
  const fixture = trusted.environment === 'isolated-local-fixture'
    && trusted.fixtureAuthorizedByServer === true
    && trusted.production === false;
  const live = trusted.environment === 'production-cutover'
    && trusted.production === true
    && trusted.sourceParity?.verified === true
    && trusted.sourceParity?.authority === 'firebase-current'
    && trusted.sourceParity?.complete === true
    && Number.isFinite(Date.parse(trusted.sourceParity.checkedAt))
    && Date.now() - Date.parse(trusted.sourceParity.checkedAt) >= 0
    && Date.now() - Date.parse(trusted.sourceParity.checkedAt) < 5 * 60 * 1000
    && trusted.cutoverApprovedByServer === true;
  if (!fixture && !live) fail('cutover_not_authorized');

  if (!validId(request.operationId)) fail('invalid_operation_id');
  if (!['create', 'update', 'delete'].includes(request.action)) fail('invalid_action');
  if (!validId(request.evaluationId)) fail('invalid_evaluation_id');
  if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 0)
    fail('missing_expected_version');

  const current = trusted.currentRecord;
  const currentVersion = trusted.currentVersion;
  if ((request.action === 'create' && (current !== null || request.expectedVersion !== 0))
      || (request.action !== 'create' && (!plain(current) || !Number.isSafeInteger(currentVersion))))
    fail('stale_or_missing_record');
  if (request.action !== 'create' && currentVersion !== request.expectedVersion)
    fail('stale_version');
  if (request.action !== 'create' && String(current?.id || current?.evaluationId || '') !== request.evaluationId)
    fail('identity_mismatch');

  const record = request.action === 'delete' ? current : request.record;
  if (!plain(record)) fail('invalid_record');
  if (String(record.id || record.evaluationId || '') !== request.evaluationId) fail('identity_mismatch');
  const kind = String(record.evaluationType || 'case');
  if (!['case', 'no_case_month'].includes(kind)) fail('invalid_record_type');
  const caseId = String(record.caseId || record.case_id || '').trim();
  if (kind === 'case' && !caseId) fail('missing_case_id');
  if (caseId.length > 180) fail('invalid_case_id');
  const score = Number(record.finalScore ?? record.final_score);
  if (!Number.isFinite(score) || score < 0 || score > 100) fail('invalid_score');
  if (!Array.isArray(record.topics)) fail('missing_topics');
  if (request.action === 'create' && record.evaluatorUsername && record.evaluatorUsername !== trusted.session.username)
    fail('evaluator_identity_mismatch');
  if (request.action === 'update' && record.evaluatorUsername !== current.evaluatorUsername)
    fail('evaluator_identity_mismatch');

  // The authoritative original scope is resolved on the server, not inferred
  // solely from the incoming form (a forged month could bypass a lock).
  const scope = trusted.authoritativeScope;
  if (!plain(scope) || !scope.agentName?.trim?.() || !dateMonth(scope.monthKey))
    fail('scope_unverified');
  if (request.action !== 'delete') {
    const suppliedMonth = record.evaluationMonthKey || record.evaluation_month_key;
    if (suppliedMonth && suppliedMonth !== scope.monthKey) fail('scope_mismatch');
  }
  if (trusted.signatureLock?.source !== 'trusted-server'
      || trusted.signatureLock?.scopeKey !== scopeKey(scope)
      || trusted.signatureLock?.verified !== true
      || trusted.signatureLock?.locked !== false) fail('monthly_results_locked_or_unverified');
  if (trusted.appealHold?.source !== 'trusted-server'
      || trusted.appealHold?.verified !== true
      || trusted.appealHold?.active !== false) fail('appeal_hold_or_unverified');

  if (request.action !== 'create') {
    if (trusted.editLease?.source !== 'trusted-server'
        || trusted.editLease?.verified !== true
        || trusted.editLease?.username !== trusted.session.username
        || trusted.editLease?.evaluationId !== request.evaluationId
        || trusted.editLease?.valid !== true) fail('edit_permission_unverified');
  }

  // No raw case body is sent to a logger by this policy. The storage layer
  // must atomically persist idempotency and optimistic version checks.
  const value = request.action === 'delete'
    ? { ...current, deletedAt: new Date().toISOString() }
    : structuredClone(record);
  const operationHash = sha(JSON.stringify([
    request.action, request.evaluationId, request.expectedVersion,
    trusted.session.username, record, // Stable across retries (delete timestamp is not hashed).
  ]));
  return {
    action: request.action,
    operationId: request.operationId,
    operationHash,
    evaluationId: request.evaluationId,
    expectedVersion: request.expectedVersion,
    nextVersion: request.expectedVersion + 1,
    actorUsername: trusted.session.username,
    scopeKey: scopeKey(scope),
    value,
    fixture,
  };
}
