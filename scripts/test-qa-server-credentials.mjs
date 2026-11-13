import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  normalizeQaUsername, constantTimePasswordMatch,
  firestoreFieldsToObject, profileActiveNow, verifyQaUsernamePassword,
  createQaFirebaseCustomToken,
} from "../server/qaFirebaseCredentials.js";

assert.equal(normalizeQaUsername("  Agent.One "), "agent.one");
for (const bad of ["", "../agent", "admin/name", "user name", "a"]) {
  assert.equal(normalizeQaUsername(bad), "");
}
assert.equal(constantTimePasswordMatch("paßword", "paßword"), true);
assert.equal(constantTimePasswordMatch("paßword", "wrong"), false);
assert.equal(constantTimePasswordMatch("", ""), false);
assert.deepEqual(firestoreFieldsToObject({
  username: { stringValue: "agent" },
  reviewed: { booleanValue: true },
  total: { integerValue: "3" },
}), { username: "agent", reviewed: true, total: 3 });
const day = "2026-11-13";
assert.equal(profileActiveNow({ status: "Active", password: "secret" }, day), true);
assert.equal(profileActiveNow({ status: "Suspended" }, day), false);
assert.equal(profileActiveNow({ status: "Active", suspendEffectiveDate: "2026-11-12" }, day), false);
assert.equal(profileActiveNow({ status: "Active", suspendEffectiveDate: "2026-11-12", suspendAutoReactivate: true, suspendEndDate: "2026-11-13" }, day), true);
assert.equal(profileActiveNow({ status: "Active", suspendEffectiveDate: "2026-11-14" }, day), true);
assert.equal(await verifyQaUsernamePassword("bad/username", "value"), null);
assert.equal(await verifyQaUsernamePassword("agent", "x".repeat(300)), null);
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const previousFirebaseServiceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
try {
  process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: "qa-dashboard-b0b5d",
    client_email: "qa-test@qa-dashboard-b0b5d.iam.gserviceaccount.com",
    private_key: keyPair.privateKey,
  });
  const sessionId = "123e4567-e89b-12d3-a456-426614174000";
  const signed = createQaFirebaseCustomToken({
    username: "Agent.One", role: "Quality Assurance",
  }, sessionId, 1800000000);
  const parts = signed.split(".");
  assert.equal(parts.length, 3, "Firebase custom token must be signed JWT");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(claims.aud, "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit");
  assert.equal(claims.uid, "qa-agent.one");
  assert.equal(claims.claims.qa_username, "agent.one");
  assert.equal(claims.claims.qa_session_id, sessionId);
  assert.equal(claims.claims.qa_role, "Quality Assurance");
  assert.equal(claims.exp - claims.iat, 3600);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(parts[0] + "." + parts[1]);
  verifier.end();
  assert.ok(verifier.verify(keyPair.publicKey, Buffer.from(parts[2], "base64url")));
  assert.throws(() => createQaFirebaseCustomToken({
    username: "bad/name", role: "Quality Assurance",
  }, sessionId));
  assert.throws(() => createQaFirebaseCustomToken({
    username: "agent", role: "Quality Assurance",
  }, "not-a-session"));
  assert.throws(() => createQaFirebaseCustomToken({
    username: "agent", role: "",
  }, sessionId));
} finally {
  if (previousFirebaseServiceAccount === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = previousFirebaseServiceAccount;
}

console.log("server-side QA Firebase credentials policy tests passed");
