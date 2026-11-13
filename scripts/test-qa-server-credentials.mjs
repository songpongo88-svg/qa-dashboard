import assert from "node:assert/strict";
import {
  normalizeQaUsername, constantTimePasswordMatch,
  firestoreFieldsToObject, profileActiveNow, verifyQaUsernamePassword,
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
console.log("server-side QA Firebase credentials policy tests passed");
