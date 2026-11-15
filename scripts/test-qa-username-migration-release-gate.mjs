import assert from "node:assert/strict";
import { createQaUsernameMigrationGuard } from "../server/qaUsernameMigrationReleaseGate.js";

const makeResponse = (status, fields = {}) => ({
  status, ok: status >= 200 && status < 300,
  async json() { return { fields }; },
});
const completed = makeResponse(200, {
  status: { stringValue: "done" },
  completedAt: { stringValue: "2026-08-18T08:00:00.000Z" },
});
let now = 1_000_000;
let requests = [];
let response = completed;
const check = createQaUsernameMigrationGuard({
  accessToken: async () => "fake-local-test-token",
  clock: () => now,
  fetcher: async (url, options) => {
    requests.push({url, options});
    return response;
  },
});
await check();
assert.equal(requests.length, 1);
assert.ok(requests[0].url.includes("/qa_system_migrations/username-title-case-policy-2026-08-18-v1"));
assert.equal(requests[0].options.method, "GET");
assert.equal(requests[0].options.headers.Authorization, "Bearer fake-local-test-token");
await check();
assert.equal(requests.length, 1, "Verified immutable migration should be cached briefly");
now += 5 * 60 * 1000 + 1;
await check();
assert.equal(requests.length, 2, "Expired positive attestation must be rechecked");

for (const [label, status, fields, code] of [
  ["missing document", 404, {}, "QA_USERNAME_MIGRATION_NOT_READY"],
  ["not completed", 200, {status: {stringValue: "running"}}, "QA_USERNAME_MIGRATION_NOT_READY"],
  ["failed migration", 200, {status: {stringValue: "failed"}}, "QA_USERNAME_MIGRATION_NOT_READY"],
  ["no completion audit", 200, {status: {stringValue: "done"}}, "QA_USERNAME_MIGRATION_NOT_READY"],
  ["permission denied", 403, {}, "QA_USERNAME_MIGRATION_CHECK_UNAVAILABLE"],
  ["server error", 503, {}, "QA_USERNAME_MIGRATION_CHECK_UNAVAILABLE"],
]) {
  const guard = createQaUsernameMigrationGuard({
    accessToken: async () => "test",
    fetcher: async () => makeResponse(status, fields),
  });
  await assert.rejects(guard(), e => e.status === 503 && e.code === code,
    label + " must fail closed");
}

let resolvePending;
let called = 0;
const delayed = createQaUsernameMigrationGuard({
  accessToken: async () => "test",
  fetcher: async () => {
    called++;
    return new Promise(resolve => { resolvePending = resolve; });
  },
});
const first = delayed();
const second = delayed();
await Promise.resolve();
await Promise.resolve();
assert.equal(called, 1, "Concurrent logins must share one migration status read");
resolvePending(completed);
await Promise.all([first, second]);

const offline = createQaUsernameMigrationGuard({
  accessToken: async () => "test",
  fetcher: async () => { throw Error("offline"); },
});
await assert.rejects(offline(), e =>
  e.status === 503 && e.code === "QA_USERNAME_MIGRATION_CHECK_UNAVAILABLE");
console.log("PASS QA username migration release prerequisite: read-only, cached, deduped and fail-closed");
