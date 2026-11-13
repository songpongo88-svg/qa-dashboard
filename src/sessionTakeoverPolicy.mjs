// Pure takeover policy. SECURITY: This module is NOT an authorization backend.
// It must run behind authenticated server endpoints with atomic session replacement.
export const SESSION_POLICY = Object.freeze({
  maxActiveSessions: 1,
  autosaveIntervalMs: 5_000,
  takeoverSaveTimeoutMs: 30_000,
  idleTimeoutMs: 30 * 60_000,
});

export const TAKEOVER_STATE = Object.freeze({
  awaitingConsent: "awaiting_consent",
  flushing: "flushing",
  ready: "ready",
  unsynced: "unsynced",
  cancelled: "cancelled",
  committed: "committed",
});

export function createTakeoverAttempt({ accountId, currentSessionId, requestedSessionId, now }) {
  if (!accountId || !requestedSessionId || !Number.isFinite(now)) throw new Error("Invalid takeover request");
  if (currentSessionId && currentSessionId === requestedSessionId) throw new Error("Cannot take over the same session");
  return Object.freeze({
    accountId,
    currentSessionId: currentSessionId || null,
    requestedSessionId,
    status: TAKEOVER_STATE.awaitingConsent,
    requestedAt: now,
    deadlineAt: now + SESSION_POLICY.takeoverSaveTimeoutMs,
    acknowledgedRevision: null,
  });
}

export function consentToTakeover(attempt, accepted) {
  if (attempt.status !== TAKEOVER_STATE.awaitingConsent) throw new Error("Consent can only be decided once");
  return { ...attempt, status: accepted ? TAKEOVER_STATE.flushing : TAKEOVER_STATE.cancelled };
}

export function acknowledgeDraftFlush(attempt, { revision, persisted, now }) {
  if (attempt.status !== TAKEOVER_STATE.flushing) throw new Error("Takeover is not awaiting a draft flush");
  if (!Number.isFinite(now)) throw new Error("Invalid time");
  if (now > attempt.deadlineAt || !persisted || !Number.isSafeInteger(revision) || revision < 0) {
    return { ...attempt, status: TAKEOVER_STATE.unsynced, acknowledgedRevision: null };
  }
  return { ...attempt, status: TAKEOVER_STATE.ready, acknowledgedRevision: revision };
}

export function takeoverAfterTimeout(attempt, now) {
  if (attempt.status !== TAKEOVER_STATE.flushing) return attempt;
  if (now < attempt.deadlineAt) return attempt;
  return { ...attempt, status: TAKEOVER_STATE.unsynced };
}

// Must be called only after server transaction confirms that expectedSessionId
// remains active, the actor is authenticated and the session swap is committed.
// Never silently override an unsynced draft.
export function canCommitTakeover(attempt, { currentActiveSessionId }) {
  // Never revoke the old session when a pending draft was not durably saved.
  // Recovery must be acknowledged by the server before a takeover can commit.
  if (attempt.status !== TAKEOVER_STATE.ready) return false;
  return (currentActiveSessionId || null) === attempt.currentSessionId;
}

export function draftRecoveryDecision({ localRevision, serverRevision, localHasUnsyncedChanges }) {
  if (!Number.isSafeInteger(localRevision) || localRevision < 0 ||
      !Number.isSafeInteger(serverRevision) || serverRevision < 0) {
    throw new Error("Draft revision required");
  }
  if (localHasUnsyncedChanges || localRevision > serverRevision) return "review_local_recovery";
  if (serverRevision > localRevision) return "restore_server";
  return "up_to_date";
}
