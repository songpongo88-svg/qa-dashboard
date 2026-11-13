// Firebase Emulator only: never connects to a live Firebase project.
// Verifies that replaced and expired browser JWTs cannot write Firestore
// evaluations or Storage evidence, even when their ID tokens remain valid.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

const projectId = "demo-qa-session";
const base = new URL("../security/qa-single-session/", import.meta.url);
const rules = await readFile(new URL("firestore.rules", base), "utf8");
const storageRules = await readFile(new URL("storage.rules", base), "utf8");
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: "127.0.0.1", port: 8181, rules },
  storage: { host: "127.0.0.1", port: 9299, rules: storageRules },
});
const activeDoc = "qa_single_session_active/agent";
const session1 = "123e4567-e89b-12d3-a456-426614174000";
const session2 = "123e4567-e89b-12d3-a456-426614174001";
const role = "Quality Assurance";
const claims = sid => ({ qa_username: "agent", qa_session_id: sid, qa_role: role });
const ctx = sid => env.authenticatedContext("qa-agent", claims(sid));
const expiresSoon = () => Date.now() + 20 * 60 * 1000;
async function setActive(sessionId, expiresAtEpochMs, newRole = role) {
  await env.withSecurityRulesDisabled(async test => {
    await setDoc(doc(test.firestore(), activeDoc), {
      username: "agent", sessionId, role: newRole, expiresAtEpochMs,
    });
  });
}
const evalRef = context => doc(context.firestore(), "qa_evaluations", "test-case");
const fileRef = context => ref(context.storage("demo-qa-session.appspot.com"),
  "qa-evaluation-evidence/AA100001/test-evidence.png");
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

try {
  await setActive(session1, expiresSoon());
  const old = ctx(session1);
  await assertSucceeds(setDoc(evalRef(old), { caseId: "AA100001", finalScore: 85 }));
  assert.equal((await getDoc(evalRef(old))).data().finalScore, 85);
  await assertSucceeds(uploadBytes(fileRef(old), bytes, { contentType: "image/png" }));

  const impostor = env.authenticatedContext("qa-other", claims(session1));
  await assertFails(setDoc(evalRef(impostor), { finalScore: 0 }));
  await assertFails(setDoc(evalRef(env.unauthenticatedContext()), { finalScore: 0 }));
  await assertFails(setDoc(doc(old.firestore(), activeDoc), { sessionId: session2 }));

  // Atomic server-side takeover is represented by changing the active pointer.
  // A still-valid JWT for the replaced browser must now fail for BOTH backends.
  await setActive(session2, expiresSoon());
  await assertFails(setDoc(evalRef(old), { caseId: "AA100001", finalScore: 0 }));
  await assertFails(uploadBytes(fileRef(old), bytes, { contentType: "image/png" }));
  const next = ctx(session2);
  await assertSucceeds(setDoc(evalRef(next), { caseId: "AA100001", finalScore: 99 }));
  await assertSucceeds(uploadBytes(fileRef(next), bytes, { contentType: "image/png" }));

  // Idle expiry and role revocation cannot be bypassed with unexpired Firebase JWTs.
  await setActive(session2, Date.now() - 1_000);
  await assertFails(setDoc(evalRef(next), { finalScore: 100 }));
  await assertFails(uploadBytes(fileRef(next), bytes, { contentType: "image/png" }));
  await setActive(session2, expiresSoon(), "Suspended");
  await assertFails(setDoc(evalRef(next), { finalScore: 100 }));
  await assertFails(uploadBytes(fileRef(next), bytes, { contentType: "image/png" }));

  console.log("PASS Firebase rules: active QA writes; stale browser, anon, forged UID, expired and changed role denied across Firestore and Storage");
} finally {
  await env.cleanup();
}
