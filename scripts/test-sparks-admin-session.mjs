import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../api/sparks-admin.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const priorServiceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const originalFetch = globalThis.fetch;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "firebase-adminsdk@example.test",
  private_key: privateKey,
  project_id: "qa-dashboard-b0b5d",
});
const policyVersion = "qa-session-policy-2026-07-15-v1";
const nowMemberYear = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date()));
const password = "test-qa-password";
let testMode = "valid";
let grant = null;
let commits = 0;
const typed = (value) => {
  if (value == null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  return { stringValue: String(value) };
};
const stored = (data, id) => ({
  name: id,
  fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typed(value)])),
  updateTime: "2026-11-05T03:00:00Z",
});
function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const qaProfiles = [
  { username: "Songpon", displayName: "QA Admin", role: "Quality Assurance", status: "Active", password },
  { username: "Suspended", displayName: "Suspended User", role: "Admin Live Chat", status: "Suspended" },
  { username: "ActiveUser", displayName: "Active User", role: "Admin Live Chat", status: "Active" },
];
globalThis.fetch = async (rawUrl, opts = {}) => {
  const url = String(rawUrl);
  const method = opts.method || "GET";
  if (url === "https://oauth2.googleapis.com/token") return reply({ access_token: "test-only-token", expires_in: 3600 });
  assert.ok(url.startsWith("https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents"), "Admin must use the same Firebase project as QA Dashboard");
  if (url.endsWith(":beginTransaction")) return reply({ transaction: "test-transaction-token" });
  if (url.endsWith(":commit")) {
    const data = JSON.parse(opts.body);
    const walletWrite = data.writes.find((write) => write.update?.name?.endsWith("qa_sparks_wallets/activeuser"));
    const historyWrite = data.writes.find((write) => write.update?.name?.includes("/history/admin-"));
    assert.ok(walletWrite, "Wallet document write must exist");
    assert.ok(historyWrite, "Atomic history document write must exist");
    assert.ok(walletWrite.update.name.startsWith("projects/qa-dashboard-b0b5d/databases/(default)/documents/"),
      "Firestore writes must use resource names instead of HTTP URLs");
    const overLimitCase = testMode === "cap";
    assert.equal(walletWrite.update.fields.balance.integerValue, overLimitCase ? "200000" : "100");
    assert.equal(historyWrite.update.fields.amount.integerValue, overLimitCase ? "50" : "100");
    assert.equal(walletWrite.update.fields.memberYearEarned.integerValue, overLimitCase ? "200000" : "100");
    assert.equal(walletWrite.update.fields.memberYear.integerValue, String(nowMemberYear));
    commits++;
    return reply({ writeResults: [{}, {}] });
  }
  if (url.includes("/qa_user_sessions/")) {
    if (testMode === "quota") return reply({ error: { status: "RESOURCE_EXHAUSTED", message: "Firestore daily quota exceeded" } }, 429);
    if (testMode === "missing") return reply({ error: { status: "NOT_FOUND" } }, 404);
    const data = {
      status: testMode === "revoked" ? "revoked" : "active",
      username: testMode === "wrong-account" ? "someone-else" : "Songpon",
      role: testMode === "wrong-role" ? "Admin Live Chat" : "Quality Assurance",
      policyVersion: testMode === "wrong-policy" ? "outdated-client-policy" : policyVersion,
      expiresAt: new Date(Date.now() + (testMode === "expired" ? -60000 : 3600000)).toISOString(),
      createdAt: "2026-11-05T02:00:00Z",
    };
    return reply(stored(data, url));
  }
  if (url.includes("/qa_user_session_controls/")) return reply({ error: { status: "NOT_FOUND" } }, 404);
  if (url.includes("/qa_sparks_admin_session_grants/")) {
    if (method === "PATCH") {
      grant = Object.fromEntries(Object.entries(JSON.parse(opts.body).fields).map(([key, value]) => [key, value.stringValue ?? value.booleanValue ?? value.integerValue]));
      return reply(stored(grant, url));
    }
    return grant ? reply(stored(grant, url)) : reply({ error: { status: "NOT_FOUND" } }, 404);
  }
  if (url.includes("/qa_user_profiles/Songpon")) return reply(stored(qaProfiles[0], url));
  if (url.includes("/qa_user_profiles/suspended") || url.includes("/qa_user_profiles/Suspended")) {
    return reply(stored(qaProfiles[1], url));
  }
  if (url.includes("/qa_user_profiles?")) return reply({ documents: qaProfiles.map((profile) => stored(profile, url + "/" + profile.username)) });
  if (url.includes("/qa_sparks_wallets?")) return reply({ documents: [] });
  if (testMode === "cap" && url.includes("/qa_sparks_wallets/activeuser") && !url.includes("/history/")) {
    return reply(stored({ balance: 199950, memberYear: nowMemberYear, memberYearEarned: 199950,
      totalEarned: 199950, username: "ActiveUser" }, url));
  }
  if (url.includes("/qa_sparks_wallets/")) return reply({ error: { status: "NOT_FOUND" } }, 404);
  return reply({ error: { status: "NOT_FOUND" } }, 404);
};
const req = (action = "list", body = {}) => ({ method: "POST", body: {
  action, actorUsername: "Songpon", sessionId: "songpon-unit-test-session", ...body,
} });
async function invoke(request = req()) {
  let code = -1, result = null;
  const res = { setHeader() {}, status(value) { code = value; return this; }, json(value) { result = value; return value; } };
  await handler(request, res);
  return { code, result };
}
try {
  const good = await invoke();
  assert.equal(good.code, 200, JSON.stringify(good.result));
  assert.deepEqual(good.result.users.map((user) => user.username), ["ActiveUser", "Songpon"], "Suspended accounts must never appear in the server directory");
  const cases = [
    ["missing", "not found"],
    ["expired", "expired"],
    ["revoked", "revoked"],
    ["wrong-account", "does not match"],
    ["wrong-role", "Quality Assurance role"],
  ];
  for (const [mode, expected] of cases) {
    testMode = mode;
    const actual = await invoke();
    assert.equal(actual.code, 403, "Failed to reject " + mode);
    assert.ok(actual.result.error.includes(expected), "Expected specific error for " + mode + ": " + actual.result.error);
  }
  testMode = "quota";
  const quotaResult = await invoke();
  assert.equal(quotaResult.code, 429, "Firestore quota exhaustion must not be misreported as a role error");
  assert.equal(quotaResult.result.code, "FIRESTORE_RESOURCE_EXHAUSTED");
  assert.ok(quotaResult.result.error.includes("Firestore"));
  testMode = "wrong-policy";
  const old = await invoke();
  assert.equal(old.code, 403);
  assert.equal(old.result.code, "SESSION_POLICY_OUTDATED", "Stale policy must require password re-verification");
  let wrong = await invoke(req("reauth", { password: "wrong-password" }));
  assert.equal(wrong.code, 403, "Incorrect QA password must not unlock Sparks");
  assert.equal(grant, null, "Failed password must never create an admin grant");

  const verified = await invoke(req("reauth", { password }));
  assert.equal(verified.code, 200, JSON.stringify(verified.result));
  assert.equal(verified.result.verified, true);
  assert.equal(grant.username, "songpon");
  assert.equal(grant.method, "qa-password");
  assert.equal(grant.policyVersion, policyVersion);
  const granted = await invoke();
  assert.equal(granted.code, 200, "Password-verified grant should allow valid QA Admin session");
  assert.deepEqual(granted.result.users.map((user) => user.username), ["ActiveUser", "Songpon"]);

  const denied = await invoke(req("adjust", {
    targetUsername: "Suspended", operation: "add", amount: 100,
    reason: "Testing suspended account guard", requestId: "suspended-request-123456",
  }));
  assert.equal(denied.code, 403, "Suspended users cannot be credited by direct API calls");
  const hiddenHistory = await invoke(req("history", { targetUsername: "Suspended" }));
  assert.equal(hiddenHistory.code, 403, "Suspended histories should not be exposed in the active admin directory");

  const add = await invoke(req("adjust", {
    targetUsername: "ActiveUser", operation: "add", amount: 100,
    reason: "QA Sparks admin unit test credit", requestId: "active-credit-request-123456",
  }));
  assert.equal(add.code, 200, JSON.stringify(add.result));
  assert.equal(add.result.balance, 100);
  assert.equal(commits, 1, "Wallet/history must be written in a single Firestore commit");
  testMode = "cap";
  const capBlocked = await invoke(req("adjust", {
    targetUsername: "ActiveUser", operation: "add", amount: 51,
    reason: "Must not exceed annual Sparks limit", requestId: "annual-cap-over-200k-123456",
  }));
  assert.equal(capBlocked.code, 400, JSON.stringify(capBlocked.result));
  assert.ok(capBlocked.result.error.includes("200,000"));
  assert.equal(commits, 1, "over-limit admin credit must not write anything");
  const capExactly = await invoke(req("adjust", {
    targetUsername: "ActiveUser", operation: "add", amount: 50,
    reason: "Exactly up to annual 200k Sparks", requestId: "annual-cap-exact-200k-123456",
  }));
  assert.equal(capExactly.code, 200, JSON.stringify(capExactly.result));
  assert.equal(capExactly.result.balance, 200000);
  assert.equal(commits, 2, "exactly up to 200k must commit");
  testMode = "valid";

  testMode = "wrong-role";
  assert.equal((await invoke()).code, 403, "Grant cannot override revoked QA role");
  testMode = "revoked";
  assert.equal((await invoke()).code, 403, "Grant cannot override revoked QA session");
  console.log("PASS Sparks Admin: secured QA password re-verification, suspended hiding, atomic authorization guards");
} finally {
  globalThis.fetch = originalFetch;
  if (priorServiceAccount === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = priorServiceAccount;
}
