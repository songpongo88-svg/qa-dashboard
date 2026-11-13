import assert from "node:assert/strict";
import {
  SESSION_POLICY, TAKEOVER_STATE, createTakeoverAttempt, consentToTakeover,
  acknowledgeDraftFlush, takeoverAfterTimeout, canCommitTakeover, draftRecoveryDecision
} from "../src/sessionTakeoverPolicy.mjs";

const now = 1_000_000;
const initial = createTakeoverAttempt({ accountId: "agent", currentSessionId: "old", requestedSessionId: "new", now });
assert.equal(SESSION_POLICY.maxActiveSessions, 1);
assert.equal(initial.deadlineAt, now + 30_000);
assert.equal(canCommitTakeover(initial, { currentActiveSessionId: "old" }), false);
const denied = consentToTakeover(initial, false);
assert.equal(denied.status, TAKEOVER_STATE.cancelled);
assert.equal(canCommitTakeover(denied, { currentActiveSessionId: "old" }), false);
const flushing = consentToTakeover(initial, true);
assert.equal(takeoverAfterTimeout(flushing, now + 10_000).status, TAKEOVER_STATE.flushing);
const ready = acknowledgeDraftFlush(flushing, { revision: 42, persisted: true, now: now + 5_000 });
assert.equal(ready.status, TAKEOVER_STATE.ready);
assert.equal(canCommitTakeover(ready, { currentActiveSessionId: "old" }), true);
assert.equal(canCommitTakeover(ready, { currentActiveSessionId: "changed-concurrently" }), false);
const failed = acknowledgeDraftFlush(flushing, { revision: 43, persisted: false, now: now + 5_000 });
assert.equal(failed.status, TAKEOVER_STATE.unsynced);
assert.equal(canCommitTakeover(failed, { currentActiveSessionId: "old" }), false);
assert.equal(canCommitTakeover(failed, { currentActiveSessionId: "old", unsyncedRiskAccepted: true }), false);
assert.equal(takeoverAfterTimeout(flushing, now + 30_000).status, TAKEOVER_STATE.unsynced);
assert.equal(acknowledgeDraftFlush(flushing, { revision: 44, persisted: true, now: now + 30_001 }).status, TAKEOVER_STATE.unsynced);
assert.equal(draftRecoveryDecision({ localRevision: 8, serverRevision: 7, localHasUnsyncedChanges: true }), "review_local_recovery");
assert.equal(draftRecoveryDecision({ localRevision: 7, serverRevision: 8, localHasUnsyncedChanges: false }), "restore_server");
assert.equal(draftRecoveryDecision({ localRevision: 8, serverRevision: 8, localHasUnsyncedChanges: false }), "up_to_date");
console.log("session takeover policy tests passed");
