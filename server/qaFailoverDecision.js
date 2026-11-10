// Failover decision policy for QA only. Firestore stays the primary datastore.
// Nothing in this module routes traffic or changes an actual user's scores.
// Only a server-verified status can activate a secondary writer. A client 429,
// browser cache, partial 563-document backup or a healthy tunnel is insufficient.
export const QA_FAILOVER_REQUIRED_DATASETS = Object.freeze([
  'qa_evaluations', 'qa_appeal_events', 'qa_signature_documents',
  'qa_user_profiles', 'qa_role_permissions', 'qa_user_sessions',
]);

const recent = (iso, now, maxAge) => {
  const at = Date.parse(iso || '');
  return Number.isFinite(at) && now >= at && now - at <= maxAge;
};
const goodIds = (items) => Array.isArray(items) &&
  items.length === QA_FAILOVER_REQUIRED_DATASETS.length &&
  new Set(items).size === items.length &&
  QA_FAILOVER_REQUIRED_DATASETS.every(id => items.includes(id));

export function qaFailoverDecision(input, now = Date.now()) {
  const blockers = [];
  if (!input || typeof input !== 'object') return {
    mode:'primary', failoverReady:false, canAcceptWrites:false, blockers:['missing_trusted_status'],
  };
  if (input.serverAuthority !== 'qa-server-verified') blockers.push('server_authority_missing');
  if (input.primary?.health !== 'quota-exhausted'
    || input.primary?.verifiedByServer !== true
    || !recent(input.primary?.checkedAt, now, 120_000)) blockers.push('quota_not_server_verified');
  if (input.bridge?.databaseConnected !== true ||
    input.bridge?.readOnly !== false ||
    input.bridge?.authenticated !== true ||
    input.bridge?.durableIngress !== true ||
    !recent(input.bridge?.checkedAt, now, 90_000)) blockers.push('standby_write_bridge_not_ready');
  if (input.mirror?.sourceComplete !== true ||
    input.mirror?.identityHashVerified !== true ||
    input.mirror?.syncStatus !== 'validated' ||
    !goodIds(input.mirror?.datasets) ||
    !recent(input.mirror?.verifiedAt, now, 120_000)) blockers.push('mirror_not_complete');
  if (input.identity?.serverAuthenticated !== true ||
    input.identity?.role !== 'Quality Assurance' ||
    input.identity?.status !== 'active' ||
    !recent(input.identity?.verifiedAt, now, 120_000) ||
    !Number.isFinite(Date.parse(input.identity?.expiresAt)) ||
    Date.parse(input.identity.expiresAt) <= now) blockers.push('identity_not_verified');
  if (input.locks?.verifiedByServer !== true ||
    input.locks?.signatureLocked !== false ||
    input.locks?.appealHold !== false ||
    !recent(input.locks?.verifiedAt, now, 120_000)) blockers.push('monthly_locks_not_verified');
  if (input.lease?.owner !== 'qa-failover-coordinator' ||
    input.lease?.approved !== true ||
    !Number.isSafeInteger(input.lease?.generation) ||
    input.lease.generation <= 0 ||
    !recent(input.lease?.grantedAt, now, 90_000) ||
    Date.parse(input.lease.expiresAt || '') <= now) blockers.push('coordinator_lease_missing');
  if (input.backlog?.unresolvedConflicts !== 0) blockers.push('unresolved_conflicts');
  if (input.manualDisable === true) blockers.push('manual_kill_switch');
  if (input.production === true && input.productionApprovedByServer !== true)
    blockers.push('production_not_approved');
  const allowed = blockers.length === 0;
  return {
    mode: allowed ? 'standby' : 'primary',
    failoverReady: allowed, canAcceptWrites: allowed,
    blockers,
    generation: allowed ? input.lease.generation : null,
  };
}

// Returning to Firestore is a SEPARATE operation, not a timer-based health
// flip. A healthy primary does not mean offline edits have been reconciled.
export function qaFailbackDecision(input) {
  const blockers = [];
  if (!input || input.serverAuthority !== 'qa-server-verified')
    blockers.push('server_authority_missing');
  if (input?.primary?.health !== 'healthy' || input.primary.verifiedByServer !== true)
    blockers.push('primary_not_healthy');
  if (input?.outbox?.pending !== 0 || input?.outbox?.inFlight !== 0 ||
    input?.outbox?.conflicts !== 0) blockers.push('offline_changes_not_reconciled');
  if (input?.parity?.complete !== true || input?.parity?.verified !== true ||
    input?.parity?.mismatches !== 0) blockers.push('post_replay_parity_not_verified');
  if (input?.lease?.frozenWrites !== true) blockers.push('standby_writes_not_frozen');
  return { canFailback:blockers.length === 0, blockers };
}
