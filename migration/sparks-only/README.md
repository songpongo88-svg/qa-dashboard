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
