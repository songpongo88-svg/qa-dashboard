# QA Dashboard PostgreSQL cutover — staged connection (2026-11-10)

**Status: NOT READY FOR PRODUCTION. No cutover enabled.** Scope: QA evaluation data, not QA Sparks.

## Verified from the user's local checks
- PostgreSQL database `qa_dashboard_lab` and loopback read-only API on `127.0.0.1:8787` connected successfully.
- The local QA backup contains 563 evaluation documents and 570 historical Excel rows, held separately.
- `qa_cutover_candidate.evaluation_snapshot` copied all 563 backed-up evaluations; local record/hash parity passed. This does NOT prove that Firebase has no later records.
- Synthetic `qa_cutover_stage` write/idempotency/version-conflict tests passed; these are NOT live QA write tests.
- Supabase-origin backup jobs remain `pending` with `validated_count=0` and cannot verify Firebase evaluation completeness.

## What this branch implements
`/api/qa-local-diagnostics` is a preview-only, secret-gated *server-to-server* connectivity probe. It returns only boolean database readiness or aggregate counts. It returns no QA case bodies, accepts no writes and remains disabled on Production even if the feature flag is set.

Preview-only Vercel environment variables (all values kept server-side):
- `QA_LOCAL_DIAGNOSTICS_ENABLED=1`
- `QA_LOCAL_DIAGNOSTIC_KEY` (operator secret, 32+ characters; only sent as `x-qa-diagnostic-key` request header, never query/browser code)
- `QA_LOCAL_BRIDGE_URL` (private HTTPS tunnel root, e.g. `https://qa-bridge.example.net/`, never a direct PostgreSQL address)
- `QA_LOCAL_BRIDGE_TOKEN` (existing local read-only API bearer token, 40+ characters)
- Optional `QA_CF_ACCESS_CLIENT_ID` and `QA_CF_ACCESS_CLIENT_SECRET` for Cloudflare Access service-to-service protection.

Allowed preview probes: `GET /api/qa-local-diagnostics?check=ready` and `?check=summary`. No QA rows are forwarded. A privately authenticated HTTPS tunnel and server access policy must exist first; a temporary Quick Tunnel is not a production endpoint. Keep local API bound to `127.0.0.1`, never expose port 5432.

### Step 3 write-path engineering (branch only, not wired to QA Dashboard)
- `server/qaCutoverWritePolicy.js` checks a **trusted server-verified** QA session, source-parity approval or isolated-fixture authorization, immutable evaluation identity, expected row version, authoritative monthly-result signature lock, appeal hold and verified edit lease. Never construct its trusted context from browser fields.
- `server/qaCutoverPgWriter.js` has transaction-based create/update/delete-tombstone, replay protection and an audit trail targeting **only** `qa_cutover_stage` tables. It explicitly rejects production use, and has no HTTP route. It is not a replacement for `src/evaluationStore.ts` yet.
- Transaction advisory locks serialize competing saves for the same operation ID and case ID, including first-time inserts. Concurrent same-operation replays are idempotent, and tombstones cannot be overwritten without an explicit restore flow. Disposable PostgreSQL 17 CI tests cover both races.
- Tests include pure policy, mocked SQL transaction and a disposable PostgreSQL 17 service in GitHub Actions. These use synthetic values and do not connect to the user's Windows server or any live QA records.
- The successful 5/5 Preview smoke check only confirms navigation/read rendering/Login are intact; it does not demonstrate that live QA writes or migrations work.

### Step 3: isolated server-owned Session prototype

- `server/qaCutoverSessionStore.js` demonstrates password verification with per-account scrypt salts, short-lived random bearer tokens stored **hashed**, server-side role/active-status lookup on every session verification, and revocation/expiry.
- The implementation **refuses to operate unless `QA_PG_ISOLATED_TEST=1` and the current database is the disposable `qa_cutover_ci_test`**. It is not an alternative Login route in QA Dashboard yet; neither real passwords nor account records have been migrated.
- `scripts/test-qa-postgres-session-integration.mjs` checks these properties on PostgreSQL 17 using synthetic passwords, and uses the returned trusted session to authorize a fixture QA Evaluation write. No real data or keys are involved.
- Before production authentication can move off Firestore: migrate/rotate credentials through a private server-authoritative process, implement rate limits, MFA/2FA policy as required, scoped session cookies, account status checks, audited admin revocation, and private ingress. Never trust `username`/`role` posted from a browser.
- The current Login implementation in `src/App.tsx` still reads Firebase user profiles, checks account passwords client-side and creates Firestore sessions; `src/sessionStore.ts` reads and writes those Firestore sessions. This prototype does not change that behavior or Firestore quota consumption.
 

### Exact-data cutover gate (new)
- `server/qaCutoverParityGate.js` requires a current, authenticated and **complete** source manifest, the matching PostgreSQL candidate manifest and per-document canonical SHA-256 for Evaluations, Appeals, signed-month documents and historical Excel rows.
- A local 563-evaluation snapshot, 570 Excel backup rows, successful PostgreSQL health check, or a `pending` source sync **cannot** certify cutover readiness.
- Differences, missing datasets, stale source evidence or duplicates block cutover. Test data is synthetic and this gate has no network or database writes.
- Source data must be reacquired from the authoritative service when a complete export becomes possible; do not synthesize missing January–May QA results, change original scores, or silently consolidate repeated case IDs.

## Remaining production blockers
1. Reconcile local QA backup against latest authoritative Firebase records by document identity and revision/content hash. Preserve missing/recent cases; do not treat 563 local records as complete live data.
2. Treat 570 historical Excel rows as separate historical source identities; preserve original scores and appeal history, do not collapse repeated Case IDs.
3. Implement authorized QA write API including authenticated sessions, revocations, roles, monthly result locks, edit permission, version conflict, replay protection, deletion tombstones and audit.
4. Set up durable private HTTPS ingress to Windows PC and monitor power/network availability; do not depend on a temporary tunnel.
5. Migrate all required read/write paths. `src/evaluationStore.ts` uses Firestore official transactions, while `src/sessionStore.ts` uses Firestore sessions. One query change is not a complete quota fix.
6. Test all protected workflows on preview, verify reports and scores, then perform an explicit, reversible cutover only after full parity. No automatic fallback to old Firebase balances or scores.

No changes to Firebase, the user's PC, QA scores, QA Sparks or production provider are performed by this branch.
