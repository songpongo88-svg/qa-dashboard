# QA Core source-commit evidence candidate — isolated staging (20 Nov 2026)

## What was added

The QA backup already has a **verified 2,427-document Windows candidate archive**, with the original 2,226-document snapshot frozen. This is a one-time copy, not continuous replication.

This change adds a **review-only source verification candidate**, to keep an unconfirmed source operation from being mistaken for a deliverable Windows update.

- `server/qaCoreSourceVerificationCandidateStage.js`: accepts an already staged, pending QA upsert intent only after **two separate server-side attestation callbacks** agree on the operation identity, project, exact committed Firestore microsecond update revision and complete typed `fields`.
- `migration/qa-core-source-verification-candidate-stage.sql`: private, RLS-forced `qa_core_replication_stage.source_verification_candidates` table restricted to `review_required` with `delivery_eligible=false` and `source_continuity_certified=false`.
- `scripts/test-qa-core-source-verification-candidate-integration.mjs`: uses a **disposable PostgreSQL 17** database and mock Firestore source receipts; checks revision and content tampering, unauthorized proofs, idempotency conflict, RLS, and immutable delivery blocks.

**The two attestation callbacks are not implemented as trusted production adapters. Their test objects are not cryptographic evidence.** Consequently the JS module is **hard-gated to the isolated CI database `qa_cutover_ci_test`** with `QA_PG_ISOLATED_TEST=1`. It cannot run against the actual Supabase or Windows databases as written. No external API route, browser mutation, scheduled job, Windows source listener, or production source read is added.

## Explicit state semantics

A successful synthetic test yields `SOURCE_READ_PROOF_STAGED_REVIEW_REQUIRED`, **not** a committed delivery or an active replica. The underlying `change_outbox` operation remains `pending / waiting`. The candidate remains `review_required` and cannot be marked ready by SQL due to check constraints.

A source write callback returning success is not by itself source-proof. A later real implementation requires server-authenticated Firestore write receipts, an independent source read at the exact revision, a durable budget and replay policy, and full authorization for QA roles, month locks, signature controls and session revocations. Server-side timestamps, merge writes, changed-again revisions or missing documents fail closed in this strict candidate stage.

## Next gated engineering work

1. Build a real server-authorized mutation boundary for all QA collections, including paths beyond `src/evaluationStore.ts` (profiles, signatures, monthly locks, settings, sessions and admin scripts). Prove no legacy clients can bypass it before claiming complete capture.
2. Implement trusted source write receipt + independent authorized Firestore read adapters with durable quota budget and exact revision ordering. No automatic retries of uncertain source commits.
3. Independently verify deletes with authoritative tombstones and reconcile gaps across all 11 source datasets.
4. Implement private Windows authenticated receiver, durable journal ACK/replay, ordering/lease control, session security, attachments and end-to-end QA recovery tests.
5. Gate production activation on a fresh parity proof, plus outage/failback rehearsal.

No more Windows operator commands are needed for this CI stage. Do not repeat the 2,850 reserved-unit Firestore scan, deploy, merge the draft PR, enable the listener, or turn on Failover.

**`QA_FAILOVER=OFF`**.

## Test evidence

GitHub Actions isolated safety run [#84](https://github.com/songpongo88-svg/qa-dashboard/actions/runs/44701060741) completed successfully in both **no-network-unit** and **isolated-postgres** jobs. The PostgreSQL 17 run explicitly passed the new source-proof integration fixture, including exact revision/fields checks, duplicate identity, RLS, and protection against marking candidate delivery-ready. These are synthetic tests only, not source Firestore or Windows acceptance.
