import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/qaSingleSessionClient.ts", import.meta.url), "utf8");
assert.match(client, /export async function assertTrustedQaSessionForMutation\(/);
assert.match(client, /await qaServerSessionRequest\("validate"\)/);
assert.match(client, /throw new QaServerSessionError\(401, "QA_SESSION_NOT_ACTIVE"\)/);

const expectations = [
  ["evaluationStore.ts", ["upsertStoredEvaluation", "deleteStoredEvaluation", "uploadCallRecordingFile", "uploadEvidenceBlobToFirebase"]],
  ["coachingStore.ts", ["upsertStoredCoachingRecord", "saveMonthlyCoachingRecord"]],
  ["coachingAttachmentUpload.ts", ["uploadCoachingAttachment"]],
  ["appealStore.ts", ["writeAppealEvent", "updateAppealDiscussionMessage", "writeAdditionalAppealAccessDecision"]],
  ["userRoleStore.ts", ["upsertStoredUserProfiles", "deleteStoredUserProfile", "upsertStoredRoleDefinition", "deleteStoredRoleDefinition", "upsertStoredRolePermissions", "upsertStoredMaintenanceState"]],
  ["passwordResetStore.ts", ["updateStoredPasswordResetRequest"]],
  ["profilePhotoStore.ts", ["upsertStoredProfilePhoto", "clearStoredProfilePhoto"]],
  ["profileHistoryStore.ts", ["appendUserProfileHistory"]],
  ["announcementStore.ts", ["upsertStoredAnnouncement", "deleteStoredAnnouncement", "upsertAnnouncementReceipt"]],
  ["signatureStore.ts", ["saveStoredSignatureLibraryEntry", "deleteStoredSignatureLibraryEntry", "saveStoredSignatureDocument", "saveStoredSignatureConfirm", "clearStoredSignatureConfirm"]],
];

for (const [file, functions] of expectations) {
  const source = await readFile(new URL("../src/" + file, import.meta.url), "utf8");
  assert.match(source, /import \{ assertTrustedQaSessionForMutation \} from ["\x27]\.\/qaSingleSessionClient["\x27]/,
    file + " must import the guarded preflight");
  for (const name of functions) {
    const index = source.indexOf("function " + name + "(");
    assert.ok(index >= 0, file + ": missing " + name);
    const start = source.indexOf("{", index);
    // For multi-line parameter / type declarations, start might find a typed object;
    // verify the mutation's initial code region before any await that modifies data.
    const snippet = source.slice(index, index + 700);
    assert.ok(snippet.includes("await assertTrustedQaSessionForMutation();"),
      file + ": unguarded mutation " + name);
  }
}
const application = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const takeoverEffect = application.split("// Server-backed takeover requests are checked independently")[1]?.split("  const startSessionTimers = () => {")[0] || "";
assert.ok(takeoverEffect.includes('document.visibilityState !== "visible"'),
  "Hidden tabs must not repeatedly poll the session backend");
assert.ok(takeoverEffect.includes('window.setInterval(() => void checkTakeover(), 10_000)'),
  "Takeover checks should be quota-aware and within the 30-second save window");
assert.ok(takeoverEffect.includes('error.code === "QA_OTHER_TABS_OPEN"'),
  "Takeover must remain retryable after extra QA tabs close");
assert.ok(takeoverEffect.includes("lastPendingId = \"\""),
  "A denied multi-tab acknowledgment cannot permanently suppress retries");
assert.ok(takeoverEffect.includes('document.addEventListener("visibilitychange", onVisible)'),
  "Visible sessions must promptly resume takeover checks");
assert.ok(takeoverEffect.includes("takeoverWorkspaceRef.current"),
  "Takeover polling must use the latest editor state without restarting on tab changes");
assert.ok(application.includes("const takeoverWorkspaceRef = useRef("),
  "Takeover polling requires a stable editor-state ref");
assert.ok(takeoverEffect.includes("}, [currentUser?.username, currentUser?.sessionId]);"),
  "Switching QA tabs must not create a new Firestore takeover poll");
assert.ok(!takeoverEffect.includes("currentUser?.sessionId, activeTab, activeWorkspaceTab, openWorkspaceTabs"),
  "Navigation must not restart takeover requests or clear pending-id state");
assert.ok(takeoverEffect.includes("lastMultiTabAlertId !== server.pendingId"),
  "Multiple open editors should warn once per takeover, not at every poll");
assert.ok(takeoverEffect.includes('lastMultiTabAlertId = server.pendingId'),
  "The multi-tab warning must remember the current pending takeover");
assert.match(takeoverEffect, /lastMultiTabAlertId = server.pendingId;[\s\S]*?lastPendingId = "";\s*\} else \{/,
  "After other workspaces close, a pending takeover must be retried");
assert.ok(takeoverEffect.includes('window.addEventListener("qa:single-session-save-failed", onSaveFailed)'),
  "Failed Evaluation/Coaching draft flush must allow another poll-time attempt");
assert.ok(takeoverEffect.includes('window.removeEventListener("qa:single-session-save-failed", onSaveFailed)'),
  "Session switch listeners must detach with the session effect");
assert.ok(takeoverEffect.includes('failedId === lastPendingId'),
  "A late flush failure must not reset the retry marker of a different takeover");
assert.ok(takeoverEffect.includes('lastPendingId = "";\n          console.warn("Single session takeover check unavailable"'),
  "Transient Firestore CAS/network failures must not lock out the pending request");
const evaluationEditor = await readFile(new URL("../src/CreateEvaluationMockup.tsx", import.meta.url), "utf8");
const coachingEditor = await readFile(new URL("../src/useCoachingSessionRecovery.ts", import.meta.url), "utf8");
for (const [name, content] of [["Evaluation", evaluationEditor], ["Coaching", coachingEditor]]) {
  assert.ok(content.includes('new CustomEvent("qa:single-session-save-failed"'),
    name + " must signal a failed or blocked flush so the old browser may retry");
  assert.ok(content.includes("requestRetry();"),
    name + " must actually signal its blocked save attempts");
}

const trustedApi = await readFile(new URL("../server/qaSingleSessionEndpoint.js", import.meta.url), "utf8");
assert.ok(trustedApi.includes('identity: { username: actor.username, role: actor.role }'),
  "Trusted server login must return the verified QA identity");
assert.ok(trustedApi.includes('identity: { username: ticket.username, role: ticket.role }'),
  "Session validation must return the verified QA identity");
assert.ok(client.includes('matchesTrustedQaIdentity('),
  "The QA browser must verify account and role against the server");
assert.ok(application.includes("if (!matchesTrustedQaIdentity(storedUser, verified))"),
  "Restoring a browser session must bind to verified QA identity first");
assert.ok(application.includes("if (!matchesTrustedQaIdentity(user, verification))"),
  "Fresh login and takeover must bind to verified QA identity");
assert.ok(application.includes('await qaServerSessionRequest("logout")'),
  "Failed local initialization must release the trusted server session");
assert.ok(application.includes('Failed to release unrestorable QA session'),
  "Failed legacy session restoration must not strand a trusted server session");

const resets = await readFile(new URL("../src/passwordResetStore.ts", import.meta.url), "utf8");
const recoverySection = resets.split("export async function createStoredPasswordResetRequest(")[1]
  ?.split("export async function updateStoredPasswordResetRequest(")[0] || "";
assert.ok(!recoverySection.includes("await assertTrustedQaSessionForMutation();"),
  "An unauthenticated employee must still be able to request password recovery");
const sparksAuth = await readFile(new URL("../server/sparksSupabaseAuth.js", import.meta.url), "utf8");
assert.ok(sparksAuth.includes('import { sessionPolicyEnabled, authorizeActiveSession } from "./qaSingleSessionAdmin.js";'),
  "Sparks must validate the same server-side QA session when policy is enabled");
assert.ok(sparksAuth.includes("await enforceSparksQaSessionBinding(actor, ctx.req);"),
  "All verified Sparks actors must be bound to an active QA session");
assert.ok(sparksAuth.includes('"SPARKS_QA_SESSION_MISMATCH"'),
  "Cross-account Sparks requests must explicitly fail closed");

// The Firebase SDK must sign in with the trusted QA Session ID before any
// legacy Firestore calls. Security Rules are a separate, mandatory release gate.
const firebaseCredentials = await readFile(new URL("../server/qaFirebaseCredentials.js", import.meta.url), "utf8");
assert.ok(firebaseCredentials.includes("export function createQaFirebaseCustomToken("));
assert.ok(trustedApi.includes('case "firebase-token": {'));
assert.ok(trustedApi.includes("createQaFirebaseCustomToken(ticket, ticket.sessionId)"));
assert.ok(client.includes('await qaServerSessionRequest("firebase-token")'));
assert.ok(client.includes("await signInWithCustomToken(firebaseAuth, grant.firebaseToken)"));
assert.ok(client.includes("idToken.claims.qa_session_id !== grant.sessionId"));
assert.ok(client.includes('login.user.uid !== "qa-" + username'));
assert.ok(application.includes("await activateQaFirebaseIdentity();"));
assert.equal(application.split("await activateQaFirebaseIdentity();").length - 1, 2,
  "Firebase Auth must bind on fresh login and restored Login");
assert.ok(application.includes("void clearQaFirebaseIdentity().catch(() => {});"),
  "QA logout and unrecoverable sessions must sign out from Firebase Auth");
const activeSessionBackend = await readFile(new URL("../server/qaSingleSessionAdmin.js", import.meta.url), "utf8");
assert.equal(activeSessionBackend.split("expiresAtEpochMs: Date.now() + TTL_MS").length - 1, 3,
  "Login, Takeover and renewal must update the rule-verifiable expiry");

console.log("QA critical mutation preflight checks passed");
