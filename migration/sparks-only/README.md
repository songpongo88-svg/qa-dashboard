# QA Sparks — Supabase production

Production cutover completed on 2026-11-08 (Asia/Bangkok).

## Data authority

| Scope | Active backend |
| --- | --- |
| QA Sparks wallets, ledger, reward inventory, payouts, quests, games and Announcement Shield | Supabase `sparks_runtime` through the private server bridge |
| QA scores, Case Detail, Coaching, Appeals, Signatures, login/session validation and QA Access Check | Existing Firebase project |

The production browser and `/api/sparks-admin` both use Supabase for Sparks. Firebase Sparks client writes are denied by the scoped rules in `firestore-after-cutover.rules`. There is no automatic fallback to Firebase balances.

## Verification

- Final source census traversed all 15 Sparks roots and the wallet history/tickets, settings history and lottery players subcollections, including missing parent documents.
- All **105 Sparks documents and 14 wallets** matched their source typed fields, creation times and update versions. The preflight and frozen final export had the same SHA-256: `1ae00d96b5a2081fe9b8003397e945ece44f210f76a11be7691d039953877b8e`.
- The original 301-document snapshot is retained privately. Its 196 QA Access Check copies are archival only; the bridge rejects those paths and the application continues reading the live Firebase QA collections.
- Deployed HTTP tests passed: concurrent first-login claims; Typing Relief reservation, 60% reduction and replay; TrueMoney redemption/use; all four special reward redemptions/activation; Lottery duplicate purchase and two-ticket limit; Fruit Match completion/replay; hidden chest concurrent claim; and Shield purchase, activation, cancellation and exactly-once automatic renewal.
- Real isolated PostgreSQL tests passed concurrent admin additions/deductions, exactly-once refunds and TrueMoney payout confirmation/replay. Original Firebase authentication checks have separate handler regressions and deployed HTTP tests.
- Rollback-only SQL checks rejected stale read sets, negative balances and mixed QA writes; no synthetic rows remained. The private production bridge passed a create/read probe, and its health probe was moved out of Sparks paths into private audit metadata.
- The full production prebuild passed. Unit fixtures clear inherited live credentials and deployment-only flags before execution.

## Runtime consistency

`runtime.sql` provides atomic commits, wallet version checks, complete transaction read-set validation, ordered transaction locks, duplicate-create protection and a database write gate. `server/sparksSupabaseBridge.js` keeps Sparks on Supabase and routes Firebase-only saga steps to Firebase.

Typing Relief uses `server/typingReliefCloudService.js`: reserve one inventory item plus a durable operation, apply a versioned Firebase QA update with an operation marker, then finalize immutable history. Retrying after a lost response resumes the same operation. Cron reconciles pending operations.

## Operations

Production flags: `SPARKS_DATA_BACKEND=supabase`, `VITE_SPARKS_DATA_BACKEND=supabase`, `SPARKS_CLOUD_READ_ONLY=0`, `VITE_SPARKS_CLOUD_READ_ONLY=0`, `SPARKS_WRITES_PAUSED=0`, `SPARKS_CUTOVER_VERIFIED=1`. Bridge URL and token are server-only Vercel settings; no private token belongs in the browser or this repository.

`/api/cloud-status` reports the server backend without reading Firebase. Its Sparks status must agree with the browser build flag. Cloud Status remains under privileged System Setup.

The one-shot migration import endpoint and production migration transport are expired after the cutover. The test schema write gate is closed, temporary Firebase fixture records were removed, and the Firebase credential's temporary Preview scope was removed.

Private backups: `sparks_migration.runtime_before_cutover_20261108` and `sparks_migration.staging_before_cutover_20261108`. The final audit batch is `server-sync-final-20261108`.

## Rollback

Freeze Sparks writes first. After production has accepted Supabase transactions, reconcile those transactions back into the intended target before switching authority. Never merely toggle Firebase writable or restore the old source snapshot over newer user activity. QA modules retain their original Firebase authority throughout.
