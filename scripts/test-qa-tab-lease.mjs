import assert from "node:assert/strict";
import { QA_TAB_LEASE_NAME, holdQaTabLease, canAcknowledgeQaTakeover } from "../src/qaTabLease.mjs";

const name = QA_TAB_LEASE_NAME;
const locks = (held, pending = []) => ({
  request: async () => {},
  query: async () => ({ held: held.map(() => ({ name })), pending: pending.map(() => ({ name })) }),
});
assert.equal(await canAcknowledgeQaTakeover(locks([])), false, "No owned tab lease must fail closed");
assert.equal(await canAcknowledgeQaTakeover(locks([1])), true, "Exactly one owned lease is safe");
assert.equal(await canAcknowledgeQaTakeover(locks([1,2])), false, "Multiple tabs must block takeover ACK");
assert.equal(await canAcknowledgeQaTakeover(locks([1],[1])), false, "Pending tab registration must block ACK");
assert.equal(await canAcknowledgeQaTakeover(null), false, "Browsers lacking Web Locks must fail closed");
assert.equal(await canAcknowledgeQaTakeover({ request() {}, async query() { throw Error("denied"); } }), false);
let held = 0;
let grantedMode = "";
const liveLocks = {
  async request(id, options, callback) {
    assert.equal(id, name);
    grantedMode = options.mode;
    held++;
    try { return await callback(); } finally { held--; }
  },
  async query() { return { held: Array.from({ length: held }, () => ({ name })), pending: [] }; },
};
const close1 = holdQaTabLease(liveLocks);
await Promise.resolve();
assert.equal(grantedMode, "shared");
assert.equal(await canAcknowledgeQaTakeover(liveLocks), true);
const close2 = holdQaTabLease(liveLocks);
await Promise.resolve();
assert.equal(await canAcknowledgeQaTakeover(liveLocks), false, "Other browser tab must block");
close2();
await Promise.resolve();
await Promise.resolve();
assert.equal(await canAcknowledgeQaTakeover(liveLocks), true);
close1();
await Promise.resolve();
await Promise.resolve();
assert.equal(await canAcknowledgeQaTakeover(liveLocks), false, "Closed tab no longer holds lease");

console.log("PASS QA browser Web Locks lease: single tab, multiple tabs, pending tab and no-support denial");
