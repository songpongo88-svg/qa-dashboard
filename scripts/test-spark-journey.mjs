import assert from "node:assert/strict";
import { createSparkJourneyService, bangkokJourneyDate, SPARK_JOURNEY_END } from "../server/sparkJourneyService.js";

const dbRows = new Map();
let draws = 0;
const draw = () => { draws += 1; return draws === 1 ? 150 : 800; };
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const backend = {
  async firestoreRequest(endpoint, method, body) {
    if (endpoint === ":beginTransaction") return { transaction: "tx-" + Math.random() };
    if (endpoint === ":rollback") return {};
    if (endpoint === ":commit") {
      for (const write of body.writes) {
        const stored = dbRows.get(write.path);
        if (write.create && stored !== undefined)
          throw Object.assign(new Error("duplicate"), { firestoreStatus: "FAILED_PRECONDITION" });
        if (!write.create && Number(write.version || 0) !== Number(stored?._version || 0))
          throw Object.assign(new Error("changed"), { firestoreStatus: "ABORTED" });
      }
      for (const write of body.writes) {
        const previous = dbRows.get(write.path);
        dbRows.set(write.path, { ...clone(previous), ...clone(write.value),
          _version: Number(previous?._version || 0) + 1 });
      }
      return {};
    }
    throw new Error("unexpected action");
  },
  async readDoc(path) {
    return dbRows.has(path) ? { data: clone(dbRows.get(path)) } : null;
  },
  recordValue(doc) { return doc?.data || {}; },
  walletDocumentPath(username) { return "qa_sparks_wallets/" + username; },
  updateWrite(path, value, doc) {
    return { path, value, version: doc?.data?._version || 0, create: false };
  },
  createWrite(path, value) { return { path, value, create: true }; },
  spendableBalance(wallet) { return Number(wallet.balance || 0); },
  annualEarnedFromWallet(wallet) { return Number(wallet.memberYearEarned || 0); },
  currentMemberYear() { return 2026; },
};
const service = createSparkJourneyService(backend, { today: () => "2026-11-13", draw });
const actorA = { username: "tester-a" };
const actorB = { username: "tester-b" };

assert.equal(bangkokJourneyDate(new Date("2026-12-25T16:59:59.000Z")), SPARK_JOURNEY_END);
assert.equal(bangkokJourneyDate(new Date("2026-12-25T17:00:00.000Z")), "2026-12-26");
await assert.rejects(() => service.claim({ routeId: "rocket" }, actorA), /ไม่พบรูปแบบ/);
assert.equal(draws, 0, "invalid route must not draw");

const first = await service.claim({ routeId: "boat", amount: 99999 }, actorA);
assert.equal(first.prize.amount, 150, "server ignores client supplied amount");
assert.equal(first.prize.routeId, "boat");
assert.equal(first.alreadyApplied, false);
assert.equal(dbRows.get("qa_sparks_wallets/tester-a").balance, 150);
assert.equal(dbRows.get("qa_sparks_wallets/tester-a/history/quest-spark-journey-2026").amount, 150);
assert.equal(dbRows.get("qa_sparks_wallets/tester-a/history/quest-spark-journey-2026").source, "spark-journey-2026");

const repeat = await service.claim({ routeId: "airplane", amount: 800 }, actorA);
assert.equal(repeat.alreadyApplied, true);
assert.deepEqual(repeat.prize, first.prize, "idempotent repeat must return original route and amount");
assert.equal(draws, 1, "repeat must not redraw");
assert.equal(dbRows.get("qa_sparks_wallets/tester-a").balance, 150, "repeat must not award twice");

const second = await service.claim({ routeId: "train" }, actorB);
assert.equal(second.prize.amount, 800, "top of range is allowed");
assert.equal(dbRows.get("qa_sparks_wallets/tester-b").balance, 800, "other user receives independent reward");

const expired = createSparkJourneyService(backend, { today: () => "2026-12-26", draw });
await assert.rejects(() => expired.claim({ routeId: "dog" }, { username: "tester-c" }), /สิ้นสุด/);
assert.equal(draws, 2, "expired claim must not draw");
console.log("Spark Journey: server range, idempotency, history, expiry and account isolation PASSED");
