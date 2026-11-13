import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../security/qa-single-session/", import.meta.url);
const firestore = await readFile(new URL("firestore.rules", root), "utf8");
const storage = await readFile(new URL("storage.rules", root), "utf8");
const server = await readFile(new URL("../server/qaSingleSessionAdmin.js", import.meta.url), "utf8");
const auth = await readFile(new URL("../server/qaFirebaseCredentials.js", import.meta.url), "utf8");

for (const [name, rules] of [["firestore", firestore], ["storage", storage]]) {
  assert.match(rules, /STAGING-ONLY/, name + " must not be mistaken for live rules");
  assert.match(rules, /qa_single_session_active/, name + " must read authoritative active session");
  assert.match(rules, /qa_username/, name + " must use server-issued username");
  assert.match(rules, /qa_session_id/, name + " must use server-issued session ID");
  assert.match(rules, /qa_role/, name + " must bind the QA role");
  assert.match(rules, /expiresAtEpochMs/, name + " must enforce idle expiration");
  assert.match(rules, /timestamp\.value\(/, name + " must compare numeric expiration");
  assert.doesNotMatch(rules, /allow\s+(?:read|write|create|update|delete)(?:\s*,\s*\w+)*\s*:\s*if\s+true\s*;/,
    name + " must not permit unconditional operations");
}
assert.match(firestore, /get\(sessionPath\(\)\)\.data\.sessionId\s*==\s*request\.auth\.token\.qa_session_id/);
assert.match(storage, /firestore\.get\(sessionPath\(\)\)\.data\.sessionId\s*==\s*request\.auth\.token\.qa_session_id/);
assert.match(firestore, /match\s+\/qa_single_session_active\/\{username\}/);
assert.match(firestore, /match\s+\/qa_evaluations\/\{evaluationId\}/);
assert.match(storage, /match\s+\/qa-evaluation-evidence\/\{caseId\}\/\{fileName\}/);
assert.match(server, /const SESSION_COLLECTION = "qa_single_session_active"/);
assert.equal(server.split("expiresAtEpochMs: Date.now() + TTL_MS").length - 1, 3);
assert.match(auth, /qa_session_id: sessionId/);
console.log("PASS Firebase rules static contract: session ID, role, expiry, no unconditional access, compatible authoritative server fields");
