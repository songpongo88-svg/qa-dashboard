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

## Corrected primary/standby objective — user-confirmed 10 November

**Firebase Firestore stays PRIMARY; local Windows PostgreSQL `qa_dashboard_lab` is STANDBY.**
Do not permanently migrate QA data to Supabase or replace Firebase as the primary.
QA Sparks/Supabase work is owned by a separate conversation and must not be changed
as part of QA evaluation failover.

### New QA-only engineering (NOT enabled on Production)
- `server/qaFailoverDecision.js` refuses standby activation unless a trusted
  backend confirms quota exhaustion, durable private tunnel, fully validated
  mirror including Evaluations, Appeals, Signatures, Users, Roles and Sessions,
  active server-verified QA identity, monthly locks, and a short-lived
  coordinator lease. A screenshot of 429, Quick Tunnel or 563-record partial
  backup does not activate the standby.
- `migration/qa-local-failover-postgres17.sql` creates a separate, additive
  schema `qa_failover_v1` for mirrored evaluations, an append-only write
  outbox and audit. **Not run on the user's computer** in this PR.
- `server/qaStandbyPgJournal.js` creates/updates/soft-deletes one evaluation
  with optimistic versions, idempotency operation ID, row locks, preserved
  evidence/score JSON and an atomic outbox entry. It rejects an unverified
  identity, locked month, appeal hold, missing edit lease, standby frozen state
  or a stale conflicting write. It does not call Firebase or QA Sparks.
- `server/qaStandbyReplayWorker.js` illustrates replay with a server-injected
  Firebase transaction adapter, per-case operation ordering and conflict
  quarantine. The actual Firebase Admin compare-and-apply adapter is **not
  yet implemented or enabled**. Returning to Firestore requires an empty
  outbox, independently verified post-replay parity and a frozen standby.
- All integration tests use synthetic records on a **disposable PostgreSQL 17**
  database `qa_cutover_ci_test`; no live case is created or changed.
- No production failover endpoint, client router, or credential mirror is live.

### Priority to make the real failover usable
1. Finish source data capture and verify complete Firestore, historical Excel,
   Appeals, Signatures, User Profiles, Roles and Sessions on local PostgreSQL.
2. Build a durable Cloudflare named Tunnel with Access policy to the local API,
   keep PostgreSQL on loopback only, and monitor PC/network availability.
3. Server-verify login/session/roles and case locks from a synced local
   authority, never from browser-submitted `username` or `role`.
4. Expose authenticated server-side evaluation reads and writes, with safe
   client fallback on server-confirmed 429 and honest incomplete-data status.
5. Implement transactional Firebase Admin replay, compare-and-swap revisions,
   conflict reviews, parity verification, and a reversibly gated Production
   rollout. No blind last-write-wins.
6. Migrate remaining QA operations (Appeals, Signatures, permissions etc.)
   as a coherent failover scope, with full regression tests.

## Remaining production blockers
1. Reconcile local QA backup against latest authoritative Firebase records by document identity and revision/content hash. Preserve missing/recent cases; do not treat 563 local records as complete live data.
2. Treat 570 historical Excel rows as separate historical source identities; preserve original scores and appeal history, do not collapse repeated Case IDs.
3. Implement authorized QA write API including authenticated sessions, revocations, roles, monthly result locks, edit permission, version conflict, replay protection, deletion tombstones and audit.
4. Set up durable private HTTPS ingress to Windows PC and monitor power/network availability; do not depend on a temporary tunnel.
5. Migrate all required read/write paths. `src/evaluationStore.ts` uses Firestore official transactions, while `src/sessionStore.ts` uses Firestore sessions. One query change is not a complete quota fix.
6. Test all protected workflows on preview, verify reports and scores, then perform an explicit, reversible cutover only after full parity. No automatic fallback to old Firebase balances or scores.

No changes to Firebase, the user's PC, QA scores, QA Sparks or production provider are performed by this branch.

### 10 November — local archive bridge (PR #210, read-only staging)
- Added `server/qaLocalBridgeServer.js` as an independent Windows-side **loopback-only** HTTP API (`127.0.0.1:8788` by default), without replacing an existing 8787 API. No Firestore or QA Sparks calls.
- `GET /ready` checks the recognized PostgreSQL QA database and archive tables. `GET /summary` returns only aggregate collection/document counts, archive match and standby mode, never case contents, identities or scores.
- Requires a private `QA_LOCAL_BRIDGE_TOKEN` of at least 40 characters in the `Authorization: Bearer ...` header; no browser CORS, write routes, or SQL from user input. Queries are read-only and capped at one concurrent status request.
- Standalone mode uses `QA_LOCAL_DATABASE_URL` pointing **only** to `localhost/qa_dashboard_lab`, with a locally installed Node `pg` driver. `node server/qaLocalBridgeServer.js` starts the listener. `QA_LOCAL_BRIDGE_PORT` is optional. Never put tokens in screenshots or browser code.
- `scripts/test-qa-local-bridge.mjs` checks denied tokens/methods, no CORS, expected archived counts, standby OFF, error redaction, and remote PostgreSQL rejection. This is a mock test, **not proof of connectivity to the user's PC**.
- For Vercel integration, use a permanent named Cloudflare Tunnel + Access policy to the chosen loopback port and an authenticated preview-only probe. **No PR merge, live failover, or replay should be enabled yet.**

### Preview-only bridge route through existing QA Appeal Cron function
- The QA-specific handler `api/cron/expire-additional-appeals.js` now dispatches requests with `qaProbe=1` to `server/qaLocalDiagnosticsHandler.js` **before** the original cron authorization logic. It avoids adding a new Hobby serverless function and never touches Sparks files.
- Operators may privately call `GET /api/cron/expire-additional-appeals?qaProbe=1&check=ready` or `check=summary` with the `x-qa-diagnostic-key` request header on a **Preview** deployment. No key is ever accepted in query parameters; do not paste credentials into a browser address bar.
- Requires Preview-only environment values `QA_LOCAL_DIAGNOSTICS_ENABLED=1`, `QA_LOCAL_DIAGNOSTIC_KEY`, `QA_LOCAL_BRIDGE_URL`, `QA_LOCAL_BRIDGE_TOKEN` and optional Cloudflare Access service credentials. Production always returns 404 for this diagnostic route regardless of flags.
- The existing scheduled QA Appeal Cron request is unchanged when `qaProbe` is absent: it still requires `CRON_SECRET`, checks and expires additional appeals using its existing rules.
- `scripts/test-qa-cron-preview-proxy.mjs` proves preview auth, anonymized output, Production denial and unchanged cron authorization against a synthetic fetch. This does **not** establish that the user's Windows bridge or Tunnel is online.

### 11 November — Windows read-only bridge launcher (no data migrations)
- Added `scripts/Start-QA-Local-Bridge.ps1` to start the local-only Node archive status server on port 8788, without touching the existing 8787 service. It **never** runs Schema, imports Mirror, writes scores, activates failover, or replays Firestore.
- Run from a checkout of the QA feature branch using PowerShell: `powershell -ExecutionPolicy Bypass -File .\scripts\Start-QA-Local-Bridge.ps1`. To verify the local server in a separate PowerShell terminal, run `powershell -ExecutionPolicy Bypass -File .\scripts\Start-QA-Local-Bridge.ps1 -CheckOnly`. Both commands suppress secrets in output.
- Required local environment values: `QA_LOCAL_DATABASE_URL` (PostgreSQL URL for `qa_dashboard_lab` on localhost) and `QA_LOCAL_BRIDGE_TOKEN` (40+ characters). The launcher uses process or current-user environment values, installs only `pg@8.16.3` locally when missing, and reports setup blockers without revealing credentials. The DB must be local and the server enforces read-only transactions.
- The user's existing Vercel QA diagnostic environment settings were moved **from an older QA-only Preview branch** to `feat/qa-local-firestore-failover-current-main-20261110` without reading or overwriting Sensitive secret values, and remain **Preview-only**. The configured bridge URL still represents a temporary `.trycloudflare.com` tunnel, not a durable ingress; it must be replaced before end-to-end Production failover is eligible.
- A successful local `-CheckOnly` response proves local authenticated aggregate reads only, **not** complete current Firestore parity or working failover. The remote Preview-to-Windows check still requires an active authenticated tunnel targeting the actual API port.

### 11 November — direct adapter for already-running 8787 on the user's Windows machine
- `scripts/Start-QA-Standby-From-Existing.ps1` is designed for the user's confirmed existing folder `%USERPROFILE%\Documents\QA_Backup\bridge`. It reads only the existing `QA_DB_NAME`, `QA_DB_USER`, `QA_DB_PASSWORD`, and `QA_LOCAL_API_TOKEN` names from the local `.env.local`, never prints their values and refuses a database other than `qa_dashboard_lab`.
- No cloned full QA repo is required on Windows: the adapter downloads exactly two **pinned commit** JavaScript read-only files to a **new** `QA_Backup\standby-probe` folder and, if necessary, installs the `pg` driver **there only**. The original `bridge` folder, local PostgreSQL schema and port 8787 are not changed.
- This tool only starts `127.0.0.1:8788`, which responds with aggregate `qa_failover_v1.source_mirror` counts. It makes **no Firestore requests, no migrations, and no record modifications**. `-CheckOnly` checks two token-authenticated endpoints and prints only public status labels and archive counts. Never equate the old 6,977-document / 41-collection report with the newer 2,081-document / 11-collection archive; they cover different scopes.
- If the existing local API token is shorter than the new bridge's 40-character requirement, the adapter stops without creating or printing a token; investigate token alignment separately rather than weakening the authentication check. An active local bridge does not yet prove the Vercel Preview's independently stored Sensitive token matches.
- The previously configured Vercel Preview `QA_LOCAL_BRIDGE_URL` was a temporary Quick Tunnel. It is not running on the user's Windows PC, so no live cross-network connectivity, live Firebase parity, nor automatic failover is claimed yet.
