// This regression test intentionally exercises the original Firebase implementation
// even when the Vercel branch deployment is configured for Supabase read-only preview.
process.env.SPARKS_DATA_BACKEND = "firebase";
process.env.SPARKS_CLOUD_READ_ONLY = "0";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../api/sparks-admin.js";
import { getTypingReliefPricing } from "../src/typingReliefPricing.mjs";

// Pricing uses Bangkok boundaries, never the browser clock as the authority.
assert.equal(getTypingReliefPricing(Date.parse("2026-11-10T23:59:59+07:00")).price,150);
assert.equal(getTypingReliefPricing(Date.parse("2026-11-11T00:00:00+07:00")).price,45);
assert.equal(getTypingReliefPricing(Date.parse("2027-01-15T23:59:59.999+07:00")).price,45);
assert.equal(getTypingReliefPricing(Date.parse("2027-01-16T00:00:00+07:00")).price,150);
assert.equal(getTypingReliefPricing(Number.NaN).price,150);
const checkoutPrice = getTypingReliefPricing(Date.now()).price;

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const oldSecret = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const originalFetch = globalThis.fetch;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "firebase-adminsdk@example.test", private_key: privateKey, project_id: "qa-dashboard-b0b5d",
});
const sessionId = "agent-test-session-1234567890";
const qaSessionId = "songpon-test-session-1234567890";
const createdAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 1_800_000).toISOString();
const docs = new Map();
const key = (col, id) => col + "/" + id;
docs.set(key("qa_user_sessions", sessionId), { username: "Agent", displayName: "Agent", role: "Admin Live Chat", status: "active", policyVersion: "qa-session-policy-2026-07-15-v1", createdAt, expiresAt });
docs.set(key("qa_user_sessions", qaSessionId), { username: "Songpon", displayName: "QA Admin", role: "Quality Assurance", status: "active", policyVersion: "qa-session-policy-2026-07-15-v1", createdAt, expiresAt });
docs.set(key("qa_user_profiles", "Agent"), { username: "Agent", role: "Admin Live Chat", status: "Active" });
docs.set(key("qa_user_profiles", "Songpon"), { username: "Songpon", role: "Quality Assurance", status: "Active" });
docs.set(key("qa_sparks_wallets", "agent"), { username: "Agent", balance: 200, firstLogin: { amount: 200 }, rewardOrders: 0 });
const task = (id, mode = "word") => ({ id, username: "Agent", displayName: "Agent", word: "สะกด", mode, repeatCount: 100, allowedMistakes: 5, timeLimitSeconds: 200, assignedAt: createdAt, assignedBy: "QA", caseIds: ["AA999001"], topicCode: "4" });
docs.set(key("qa_typing_challenges", "agent"), { username: "Agent", queue: [task("task-one")], queueCount: 1 });
let commits = 0;
let quotaBlocked = false;
let revision = 1;
const copy = (x) => structuredClone(x);
function typed(value) {
  if (value === undefined || value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(typed) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typed(v)])) } };
}
function untyped(value) {
  if (!value || "nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, untyped(v)]));
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(untyped);
  return null;
}
const row = (k, v) => ({
  name: "projects/qa-dashboard-b0b5d/databases/(default)/documents/" + k,
  fields: Object.fromEntries(Object.entries(v).map(([x, y]) => [x, typed(y)])),
  updateTime: "2026-11-05T00:00:00Z",
});
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
globalThis.fetch = async (urlInput, options = {}) => {
  const url = String(urlInput);
  if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "fake-access-token", expires_in: 3600 });
  assert.ok(url.startsWith("https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents"), "must use QA Firestore project");
  if (quotaBlocked) return json({ error: { status: "RESOURCE_EXHAUSTED", message: "daily quota exceeded" } }, 429);
  if (url.endsWith(":beginTransaction")) return json({ transaction: "mock-transaction" });
  if (url.endsWith(":commit")) {
    const writes = JSON.parse(options.body).writes;
    for (const w of writes) {
      assert.ok(w.update.name.startsWith("projects/qa-dashboard-b0b5d/databases/(default)/documents/"), "commit must use Firestore resource paths");
      const k = w.update.name.split("/documents/")[1];
      if (w.currentDocument?.exists === false && docs.has(k)) return json({ error: { status: "FAILED_PRECONDITION" } }, 412);
    }
    for (const w of writes) {
      const k = w.update.name.split("/documents/")[1];
      const payload = Object.fromEntries(Object.entries(w.update.fields).map(([x, v]) => [x, untyped(v)]));
      const next = { ...(docs.get(k) || {}) };
      for (const field of w.updateMask?.fieldPaths || Object.keys(payload)) next[field] = payload[field];
      docs.set(k, next);
    }
    commits++;
    return json({ writeResults: writes.map(() => ({})) });
  }
  const k = decodeURIComponent(new URL(url).pathname.split("/documents/")[1] || "");
  if (!docs.has(k)) return json({ error: { status: "NOT_FOUND" } }, 404);
  return json(row(k, docs.get(k)));
};
const call = async (action, rest = {}, actorUsername = "Agent", id = sessionId) => {
  let status = 0, data;
  const res = {
    setHeader() {},
    status(code) { status = code; return this; },
    json(payload) { data = payload; return payload; },
  };
  await handler({ method: "POST", body: { action, actorUsername, sessionId: id, ...rest } }, res);
  return { status, data };
};
const buy = (ref) => call("redeem-typing-relief", { requestId: ref, expectedPrice: checkoutPrice });
const use = (challengeId) => call("use-typing-relief", { challengeId });
const wallet = () => docs.get(key("qa_sparks_wallets", "agent"));
const queue = () => docs.get(key("qa_typing_challenges", "agent")).queue;
const history = () => [...docs.entries()].filter(([k]) => k.startsWith("qa_sparks_wallets/agent/history/")).map(([, v]) => v);

try {
  const purchase1 = await buy("typing-relief-first-purchase-1234");
  assert.equal(purchase1.status, 200, JSON.stringify(purchase1.data));
  assert.equal(purchase1.data.owned, 1);
  assert.equal(purchase1.data.balance, 200 - checkoutPrice);
  assert.equal(purchase1.data.priceCharged, checkoutPrice);
  assert.equal(wallet().rewardOrders, 1);
  assert.equal(wallet().totalSpent, checkoutPrice);
  assert.equal(history().find((x) => x.source === "reward-redemption")?.amount, -checkoutPrice);
  assert.equal(history().find((x) => x.source === "reward-redemption")?.priceDiscountPercent, checkoutPrice === 45 ? 70 : 0);
  const count1 = commits;
  const duplicateBuy = await buy("typing-relief-first-purchase-1234");
  assert.equal(duplicateBuy.status, 200);
  assert.equal(duplicateBuy.data.alreadyApplied, true);
  assert.equal(commits, count1, "purchase must be idempotent");
  const validBalance = wallet().balance;
  docs.set(key("qa_sparks_wallets", "agent"), { ...wallet(), balance: checkoutPrice - 1 });
  assert.equal((await buy("typing-relief-low-balance-1234")).status, 400);
  assert.equal(wallet().balance, checkoutPrice - 1);
  docs.set(key("qa_sparks_wallets", "agent"), { ...wallet(), balance: validBalance });
  const staleQuote = await call("redeem-typing-relief", {
    requestId: "typing-relief-stale-price-1234", expectedPrice: checkoutPrice === 45 ? 150 : 45,
  });
  assert.equal(staleQuote.status, 409, "a stale client quote must never silently overcharge or undercharge");
  assert.equal(wallet().balance, validBalance);
  assert.equal(wallet().typingReliefOwned, 1);
  console.log("PASS Typing Relief 70% promo pricing, Bangkok midnight expiry, immutable ledger, stale-quote refusal and duplicate purchase protection");

  const used = await use("task-one");
  assert.equal(used.status, 200, JSON.stringify(used.data));
  assert.equal(used.data.remainingWords, 40);
  assert.equal(used.data.appliedWords, 60);
  assert.equal(wallet().typingReliefOwned, 0);
  assert.equal(queue()[0].repeatCount, 40);
  assert.deepEqual(queue()[0].caseIds, ["AA999001"], "QA case links must be retained");
  assert.equal(queue()[0].allowedMistakes, 5, "original mistake policy must be retained");
  assert.equal(queue()[0].timeLimitSeconds, 200, "original time allowance must be retained");
  assert.equal(history().find((x) => x.source === "reward-activation")?.amount, 0);
  const count2 = commits;
  const repeatedUse = await use("task-one");
  assert.equal(repeatedUse.status, 200);
  assert.equal(repeatedUse.data.alreadyApplied, true);
  assert.equal(commits, count2, "a reward may be used only once on one challenge");
  console.log("PASS one-time reward activation 100->40, preserved QA restrictions and case links");

  docs.set(key("qa_sparks_wallets", "agent"), { ...wallet(), balance: 3000 });
  for (let i = 0; i < 10; i++) {
    const r = await buy("typing-relief-cap-test-" + String(i).padStart(4, "0") + "-1234");
    assert.equal(r.status, 200, "buy number " + (i + 1));
  }
  assert.equal(wallet().typingReliefOwned, 10);
  assert.equal((await buy("typing-relief-over-cap-1234")).status, 400);
  assert.equal(wallet().typingReliefOwned, 10, "inventory must not exceed 10");
  docs.set(key("qa_typing_challenges", "agent"), { username: "Agent", queue: [task("task-two")], queueCount: 1 });
  assert.equal((await use("task-two")).status, 200);
  assert.equal(wallet().typingReliefOwned, 9);
  assert.equal((await buy("typing-relief-restock-after-use-1234")).status, 200);
  assert.equal(wallet().typingReliefOwned, 10);
  console.log("PASS 10-slot cap; using one frees one replacement slot");

  // Refund of an unused Typing Relief must revoke one entitlement atomically.
  const adminRefund = await call("adjust", {
    operation: "refund", targetUsername: "Agent", reason: "QA requested refund for unused reward",
    referenceId: "redeem-typing-relief-restock-after-use-1234", requestId: "typing-relief-admin-refund-12345",
  }, "Songpon", qaSessionId);
  assert.equal(adminRefund.status, 200, JSON.stringify(adminRefund.data));
  assert.equal(wallet().typingReliefOwned, 9);
  assert.equal(adminRefund.data.balance, wallet().balance);
  console.log("PASS admin refund returns Sparks and removes one unused entitlement");

  docs.set(key("qa_typing_challenges", "agent"), { username: "Agent", queue: [task("sentences", "sentence")], queueCount: 1 });
  assert.equal((await use("sentences")).status, 400, "word reduction must not count full sentences as words");
  assert.equal(wallet().typingReliefOwned, 9);

  // Percentage-based discount must scale with each assignment rather than deduct a fixed 60 words.
  const percentageScenarios = [
    [50, 20, 30], [150, 60, 90], [200, 80, 120], [33, 14, 19], [1, 1, 0],
  ];
  for (const [assigned, remaining, discounted] of percentageScenarios) {
    const id = "percent-task-" + assigned;
    docs.set(key("qa_typing_challenges", "agent"), { username: "Agent", queue: [task(id)], queueCount: 1 });
    docs.get(key("qa_typing_challenges", "agent")).queue[0].repeatCount = assigned;
    const previousOwned = wallet().typingReliefOwned;
    const actual = await use(id);
    assert.equal(actual.status, 200, JSON.stringify(actual.data));
    assert.equal(actual.data.remainingWords, remaining, "wrong 60% remaining words for " + assigned);
    assert.equal(actual.data.appliedWords, discounted, "wrong 60% discount for " + assigned);
    assert.equal(queue()[0].repeatCount, remaining);
    assert.equal(wallet().typingReliefOwned, previousOwned - 1);
    const usage = history().find((row) => row.source === "reward-activation" && row.challengeId === id);
    assert.equal(usage?.reductionPercent, 60, "history must record the rule used");
  }
  assert.equal(wallet().typingReliefOwned, 4);
  console.log("PASS Typing Relief percentage cases: 50→20, 150→60, 200→80, 33→14 (round up), 1→1");

  assert.equal((await call("redeem-typing-relief", { requestId: "typing-relief-impersonation-1234" }, "OtherUser", sessionId)).status, 403);
  docs.set(key("qa_user_profiles", "Agent"), { ...docs.get(key("qa_user_profiles", "Agent")), status: "Suspended" });
  assert.equal((await buy("typing-relief-suspended-1234")).status, 403);
  docs.set(key("qa_user_profiles", "Agent"), { ...docs.get(key("qa_user_profiles", "Agent")), status: "Active" });
  const lastBalance = wallet().balance, lastOwned = wallet().typingReliefOwned;
  quotaBlocked = true;
  const exhausted = await buy("typing-relief-quota-block-1234");
  assert.equal(exhausted.status, 429);
  assert.equal(wallet().balance, lastBalance);
  assert.equal(wallet().typingReliefOwned, lastOwned);
  console.log("PASS suspended and impersonated access denied, quota-limited writes never change balances");
} finally {
  globalThis.fetch = originalFetch;
  if (oldSecret === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = oldSecret;
}
