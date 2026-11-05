import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../api/sparks-admin.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const priorServiceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const originalFetch = globalThis.fetch;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "firebase-adminsdk@example.test",
  private_key: privateKey,
  project_id: "qa-dashboard-b0b5d",
});
const policyVersion = "qa-session-policy-2026-07-15-v1";
let testMode = "valid";
const typed = (value) => value === null ? { nullValue: "NULL_VALUE" } : typeof value === "number" ? { integerValue: String(value) } : typeof value === "boolean" ? { booleanValue: value } : { stringValue: String(value) };
const stored = (data, id) => ({ name: id, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typed(value)])) });
function reply(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }); }
globalThis.fetch = async (rawUrl) => {
  const url = String(rawUrl);
  if (url === "https://oauth2.googleapis.com/token") return reply({ access_token: "test-only-token", expires_in: 3600 });
  assert.ok(url.startsWith("https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents"), "Admin must use the same Firebase project as QA Dashboard");
  if (url.includes("/qa_user_sessions/")) {
    if (testMode === "missing") return reply({ error: { status: "NOT_FOUND" } }, 404);
    const data = {
      status: testMode === "revoked" ? "revoked" : "active",
      username: testMode === "wrong-account" ? "someone-else" : "Songpon",
      role: testMode === "wrong-role" ? "Admin Live Chat" : "Quality Assurance",
      policyVersion: testMode === "wrong-policy" ? "old-policy" : policyVersion,
      expiresAt: new Date(Date.now() + (testMode === "expired" ? -60000 : 3600000)).toISOString(),
      createdAt: new Date(Date.now() - 60000).toISOString(),
    };
    return reply(stored(data, url));
  }
  if (url.includes("/qa_user_session_controls/")) return reply({ error: { status: "NOT_FOUND" } }, 404);
  if (url.includes("/qa_user_profiles/Songpon")) return reply(stored({ username: "Songpon", role: "Quality Assurance", status: "Active" }, url));
  if (url.includes("/qa_user_profiles?")) return reply({ documents: [stored({ username: "Songpon", displayName: "QA Admin", role: "Quality Assurance", status: "Active" }, url)] });
  if (url.includes("/qa_sparks_wallets?")) return reply({ documents: [] });
  return reply({ error: { status: "NOT_FOUND" } }, 404);
};
const req = () => ({ method: "POST", body: { action: "list", actorUsername: "Songpon", sessionId: "songpon-unit-test-session" } });
async function invoke() {
  let code = -1, result = null;
  const res = { setHeader() {}, status(value) { code = value; return this; }, json(value) { result = value; return value; } };
  await handler(req(), res);
  return { code, result };
}
try {
  const good = await invoke();
  assert.equal(good.code, 200, JSON.stringify(good.result));
  assert.equal(good.result.users.length, 1);
  assert.equal(good.result.users[0].username, "Songpon");
  const cases = [
    ["missing", "not found"],
    ["expired", "expired"],
    ["revoked", "revoked"],
    ["wrong-account", "does not match"],
    ["wrong-role", "Quality Assurance role"],
    ["wrong-policy", "out of date"],
  ];
  for (const [mode, expected] of cases) {
    testMode = mode;
    const actual = await invoke();
    assert.equal(actual.code, 403, "Failed to reject " + mode);
    assert.ok(actual.result.error.includes(expected), "Expected specific error for " + mode + ": " + actual.result.error);
  }
  console.log("PASS Sparks Admin: client/server Firebase project parity and secure session role, expiry, revocation, account matching");
} finally {
  globalThis.fetch = originalFetch;
  if (priorServiceAccount === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = priorServiceAccount;
}
