import { googleAccessToken } from "./qaFirebaseCredentials.js";

// Release prerequisite for the legacy Username title-case migration.
// Never run this migration from an unauthenticated browser in trusted mode.
// The project-scoped service account READS a single existing Firestore doc.
// No write/migration/permission changes are performed here.
const MIGRATION_DOCUMENT =
  "https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d" +
  "/databases/(default)/documents/qa_system_migrations/" +
  "username-title-case-policy-2026-08-18-v1";
const VERIFIED_CACHE_MS = 5 * 60 * 1000;

function fail(code) {
  return Object.assign(new Error("QA username migration is not verified"), {
    status: 503, code,
  });
}

// Dependencies are injected solely so the real status checks can be tested
// without contacting live Firebase or exposing credentials in CI.
export function createQaUsernameMigrationGuard({
  accessToken = googleAccessToken,
  fetcher = fetch,
  clock = Date.now,
} = {}) {
  let verifiedUntil = 0;
  let inFlight = null;
  return async function assertMigrationCompleted() {
    if (verifiedUntil > clock()) return;
    if (inFlight) return inFlight;
    const check = (async () => {
      let response;
      try {
        response = await fetcher(MIGRATION_DOCUMENT, {
          method: "GET", cache: "no-store",
          headers: { Authorization: "Bearer " + await accessToken() },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw fail("QA_USERNAME_MIGRATION_CHECK_UNAVAILABLE");
      }
      if (response.status === 404) {
        throw fail("QA_USERNAME_MIGRATION_NOT_READY");
      }
      if (!response.ok) {
        throw fail("QA_USERNAME_MIGRATION_CHECK_UNAVAILABLE");
      }
      const doc = await response.json().catch(() => null);
      if (doc?.fields?.status?.stringValue !== "done" ||
          !String(doc?.fields?.completedAt?.stringValue || "").trim()) {
        throw fail("QA_USERNAME_MIGRATION_NOT_READY");
      }
      verifiedUntil = clock() + VERIFIED_CACHE_MS;
    })();
    inFlight = check;
    try {
      await check;
    } finally {
      if (inFlight === check) inFlight = null;
    }
  };
}

export const assertQaUsernameMigrationReady = createQaUsernameMigrationGuard();
