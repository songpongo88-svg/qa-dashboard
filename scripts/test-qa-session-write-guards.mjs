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

console.log("QA critical mutation preflight checks passed");
