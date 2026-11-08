# QA Sparks only — cloud migration staging (no production cutover)

## Goal
Move **QA Sparks only** to a hosted PostgreSQL database, while keeping the existing Vercel URL, QA scores, Case Detail, Coaching, Appeals, Signatures and other modules unchanged. The database must stay reachable when the owner's Windows PC is off.

**Current state: preparation only. This branch does not read or write Firebase and must not be deployed as a cutover.** The SQL here creates empty staging tables, not a working Sparks backend.

## Confirmed code paths (GitHub main, reviewed 2026-11-08)
- `src/qaSparksStore.ts`: client-side Firestore wallet, first-login transaction, nested `history`.
- `api/sparks-admin.js`: Vercel-side Firestore REST for rewards, admin adjustments, TrueMoney, quest, games and server sessions.
- `server/fruitMatchService.js`, `qaLotteryService.js`, `snakesLaddersService.js`, `hiddenTreasureService.js`, `announcementShieldService.js`, `qaRewardsService.js`: transactions and dependent collections.
- `src/qaTypingChallengeStore.ts`, `src/qaTypingChallengeHistoryStore.ts`: typing game state/history.
- Rewards include nested wallet items and subcollections `history` and `lottery_tickets`; reward settings also contain nested history.
- Existing `qa_user_sessions`, `qa_user_profiles`, `qa_user_session_controls`, `qa_user_profile_photos` continue to be Firebase dependencies for authorization and quests. Moving only wallet records will NOT eliminate all Firebase quota dependence.

## Guardrails
1. No Firebase deletion, no Spark changes in production, no immediate GitHub main/production deployment.
2. Export a **read-only** Firebase snapshot with complete collection/subcollection traversal; no 500/1000 case limit. Protect personal phone, email, and receipt images; never commit actual user data or credentials to Git.
3. Copy snapshots into `sparks_migration.documents` using **source path as the stable primary key**. For repeated imports, compare `source_update_time` and source hash; never add balance amounts or grant rewards from snapshot imports.
4. Verify every wallet and nested ledger item plus reward requests, item expirations, receipt locks, TrueMoney payouts, lottery tickets/settlements, daily quests and auto-renewals against source counts and per-account values; preserve source document IDs and timestamps.
5. Keep Sparks mutation paths paused during a **short final delta sync**; a disabled UI alone may not prevent scheduled cron jobs. Freeze all Sparks entry points, including the cron settlement and renewals, during cutover.
6. Build hosted transactional API with server-side user/session verification, per-user access authorization, atomic balance+ledger writes, idempotency on every redemption/payout and safe retries; avoid service-role key exposure to browsers.
7. Replace **both** browser Firestore wallet operations and server /api/sparks-admin + service reads/writes with hosted backend. Retain original Firebase as rollback snapshot; allow only **one active write authority** to avoid double Sparks.
8. Switch behind a server-only feature flag after a full staging smoke test. Audit read/write/latency quotas and database space. Test PC off, reload, double click, simultaneous requests, and cron.
9. Reconcile outstanding TrueMoney payments and special rewards before cutover. The application never transfers real money itself.
10. Rollback only after reconciling writes performed since cutover; never switch both databases to writable simultaneously.

## Why hosted DB?
The local PostgreSQL lab at `127.0.0.1` stops serving others if that PC is off. The hosted option is independent of that PC. A free tier still has database size, outbound bandwidth, uptime and/or inactivity limits. Supabase Free currently has a 500 MB DB with possible project pausing after inactivity; assess actual wallet and receipt image size before selecting a plan.

## Next permitted actions
- Connect an owned hosted database project through an approved connector.
- Apply `schema.sql` **only to a new empty hosted staging database**. It does not contain credentials and does not migrate data.
- Export source collections without live changes; produce a reconciliation report.
- Implement and test the compatible API on the staging branch.
- Explicit production approval only after parity and rollback checks.

## Source manifest
See `inventory.json` for collections and nested paths found in code. Re-run a full repository + Firestore inventory before production migration; there can be additional collections and dynamically composed paths.

## Implemented on 2026-11-08 (draft branch only)
- Source snapshot export from Firebase: 298 unique documents, all imported to private `sparks_migration.documents`.
- Cloned byte-for-byte typed fields and source timestamps into separate `sparks_runtime.documents`: 298 paths, zero field or timestamp differences. Runtime `writes_enabled=false`.
- Added `sparks_runtime.commit_writes(jsonb)`, an atomic Postgres transaction guard that checks Firestore-style `updateTime` / `exists` preconditions and prevents duplicate creates. Synthetic create/update/replay/stale-write tests were executed inside a rolled-back SQL transaction (no source data changed).
- Deployed private Supabase Edge Function `qa-sparks-runtime-preview` with dedicated secret token known only to the server. The key is stored in branch-only Vercel Preview environment variables, **never in GitHub and never in a browser**.
- Added `server/sparksSupabaseBridge.js`, default-off `SPARKS_DATA_BACKEND=supabase` backend option, plus authenticated wallet read and first-login claim preview API actions. Browser wallet reads and first-login modal support the independent, default-off `VITE_SPARKS_DATA_BACKEND=supabase` flag.
- Did not change production Vercel environment variables, GitHub main, Firebase user data, reward status, or existing QA cases.
- Added a test for routing isolation, document reads, collection listing, conflict responses, and secret transport. It passed in the Vercel Preview build test suite.
- Followed existing user-guide review and CI process; the reviewed source-hash record is committed separately to this branch.

### Unresolved before any live cutover
1. **Nested lottery players:** the first export covered wallet history and lottery tickets but did not traverse `qa_sparks_lottery_draws_v1/{draw}/players`. A local supplemental read-only scanner and exporter were prepared; scan the actual Windows Firebase source and append any missing player documents to both snapshot and runtime. Do not assume zero players just because lottery tickets count is zero.
2. **Source delta:** first export is point-in-time; verify Firebase has no subsequent new or changed Sparks documents and review cron/auto-renewal state before final sync.
3. **Other direct-browser Firebase calls:** typing challenge and typing history remain Firebase. Inventory all dependencies and decide which are shared QA functions versus Sparks-specific for exact scope. The cloud backend is **not** a complete replacement for every feature yet.
4. **Real authenticated end-to-end tests:** connect preview flags only after confirming read-only behavior; confirm wallet, quest, games, admin adjustments, reward item lifecycle and refund flow. Run race/retry tests on synthetic isolated data.
5. **Production:** do not enable `writes_enabled` or production flags before all parity checks; only one database may accept Sparks writes. Production remains on Firebase.

### Implementation notes
- `migration/sparks-only/runtime.sql`: source-controlled Postgres runtime and concurrency guard.
- `migration/sparks-only/schema.sql`: original read-only staging.
- `api/sparks-admin.js`: server actions continue validating original QA sessions via Firebase.
- Supabase Edge `qa-sparks-runtime-preview`: server-to-server preview transport only, not an end-user API.
- Vercel Preview env keys used: `SPARKS_SUPABASE_BRIDGE_URL`, `SPARKS_SUPABASE_BRIDGE_TOKEN`; optional feature switches `SPARKS_DATA_BACKEND`, `VITE_SPARKS_DATA_BACKEND` intentionally remain unset.

## 2026-11-08 — QA Lottery source supplement + read-only Preview verification
- The owner ran the missing nested lottery player export; Supabase staging and runtime now both contain **299** original documents, including **one** `qa_sparks_lottery_draws_v1/2026-11-16/players/*` document. Its payload contains **two embedded lottery tickets** and a wallet owner. A lottery ticket subcollection may be empty because this version uses embedded tickets.
- Tested an atomic transaction using the imported player and wallet data: a synthetic +123 Sparks payout and immutable history write were committed together *inside a PostgreSQL transaction*, a duplicate replay failed safely, and the whole test was **rolled back**. Post-test: **299 staging = 299 runtime**, no balance/payload differences, no test ledger rows, `writes_enabled=false`.
- The protected branch now supports **Supabase Preview read-only** mode. The server blocks all non-whitelisted Sparks actions (including first-login, rewards, redemptions, quests, games, admin changes, and the settlement cron) before making remote calls. The UI labels the preview as read-only and suppresses welcome/profile auto-claims. The preview uses a branch-specific server token and does not change production env, DNS, user accounts or QA scores.
- Sparks Admin no longer uses the Firestore wallet read quota guard or legacy Firebase cache as an authoritative cloud balance when cloud preview is selected.
- **Typing Relief activation is intentionally blocked in cloud mode pending cross-database design:** its server transaction modifies both the Sparks wallet and the QA Access Check typing challenge queue, while the normal typing challenge UI still writes to Firebase. Without an atomic resolution this would split the authoritative state. Do NOT enable full production cutover while this dependency remains.
- Latest data source still needs a *final delta check* immediately before live cutover, as the snapshot is not continuously synchronized.

## QA Access Check isolation — verified after 301-document sync
- User confirmed the Supabase Preview balance and reward count match the real Firebase owner wallet: **230,656 Sparks**, **9 reward orders**, 35 history rows. Supabase private staging and preview each contain **301** documents; no payload/version mismatches, all 14 wallet balances match their latest ledger rows.
- `qa_typing_challenges` and `qa_typing_challenge_history` remain **Firebase-owned QA Access Check collections**, even though the historical snapshot retained copies of them. They are no longer routed by the server-side Supabase bridge or the private Supabase read endpoint.
- Postgres `sparks_runtime.commit_writes` now also rejects any attempted QA Access Check write with `CROSS_DATABASE_QA_ACCESS_CHECK_BLOCKED`. A synthetic test enabled writes inside an SQL transaction, verified rejection and rolled back; **301 documents remain and live-write gate is disabled**.
- Added a mocked transport regression test that sends mixed wallet + QA challenge writes, asserts an explicit 409 and **zero outgoing network requests**. Read-only Preview remains enabled; the cross-database Typing Relief activation is still blocked until an idempotent, recoverable two-phase workflow is built and validated.

## Typing Relief cross-database recovery — automated tests passed (2026-11-08)
- Cloud-only activation uses a **durable Supabase operation journal** keyed by username + QA assignment, and a single Supabase wallet compare-and-swap reservation. The QA Access Check assignment still lives on Firebase and is updated with a matching operation marker.
- When Firebase commits but the response is lost, a repeated request sees the marker and finalizes the Supabase history rather than reducing the QA word count a second time. The server cron checks pending reservations for recovery; unresolved changed/missing assignments are reported, never silently refunded.
- New regression `test:sparks-cloud-typing-relief` passed simulations of success, double submission, failure before Firebase write, lost response after Firebase commit, a changed QA assignment, and cron recovery.
- Supabase SQL now rejects **unversioned writes to existing wallets**, negative/malformed balances, duplicate immutable history writes and mixed QA Access Check writes. SQL tests used explicit transaction rollback: **301 original records preserved**.
- `qa_sparks_typing_relief_operations` was added to the **private** Sparks Edge route and SQL allowlist, not to public tables or the Firebase QA Access Check data model.
- **This does not certify a production cutover:** the full Firebase source must be freshly synchronized and checked for new/changed/deleted Sparks records, a live end-to-end test must be completed in an isolated environment, and Vercel Production currently has no Supabase bridge credentials/flags. The read-only Preview gate remains enabled; production Sparks remains on Firebase.
