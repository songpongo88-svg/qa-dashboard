# QA Windows signed replay inbox — disposable PG17 laboratory (20 November 2026)

## Scope and current system state

- Windows local snapshot: prior **2,226 documents**, independently archived and hash-verified candidate **2,427 documents** (11 datasets). The candidate is not active.
- Live QA Dashboard still writes directly to Firestore from multiple browser and admin paths. The end-to-end source commit feed is **not certified**.
- QA Windows receiver and failover are **OFF**. No real Windows listener is started or configured by this stage.

## CI-only module

The new `server/qaWindowsSignedReplayReceiverLab.js` and
`migration/qa-windows-signed-replay-receiver-lab.sql` model a future
private receiver, **only against disposable PostgreSQL 17 database
`qa_cutover_ci_test`**. They have no HTTP route, scheduler, outside
network connection, real Windows role, access token or source capture.

Safety properties exercised by CI:

1. Accepts an **Ed25519-signed** review-only envelope. The configured
   signing key must match a pinned SPKI SHA-256 fingerprint. This is a
   cryptographic integrity check of a **test message**, not a Firestore
   source-authentication proof.
2. Requires a strict schema, one of the 11 QA collections, exact document
   identity and microsecond source revision, and SHA-256 of typed Firestore
   document JSON. Invalid signatures and tampered documents are rejected.
3. Uses a per-stream PostgreSQL cursor locked with `FOR UPDATE`;
   sequence gaps are rejected for reconciliation rather than silently
   skipped. Concurrent identical deliveries are idempotent. A reused
   sequence with different content, or a stale revision of the same
   document, is rejected.
4. Restricts the private inbox to `review_required`. Database CHECK
   constraints prohibit `delivery_eligible=true`,
   `failover_eligible=true` or `source_continuity_verified=true`.
   RLS is forced and public/anonymous roles receive no access.
5. Does **not** write to `qa_failover_v1` snapshots, source deltas,
   `qa_windows_probe_v1`, QA evaluations, appeals, signatures, sessions,
   Supabase, Firestore or Production. No source document reads are made.

### What this is NOT

A locally generated CI signing key proves only that the toy envelope is
untampered **after signing**. It does not prove the sender was an
authorized QA backend, that Firestore accepted the write, that the
source sequence contains every event, or that the Windows host has
received anything. Do not confuse a gap-free **synthetic** stream with
a gap-free Firestore source feed.

Deletion/tombstone events remain blocked; a 404 is not historical proof
of deletion. External writer completeness, source-committed revision
attestations, replay authorization, attachments, locks, admin account
sessions, disaster failback and independently reconciled parity must
still be implemented and tested.

## Release gate

No new Firestore scan, no real source GET, no Windows PowerShell command,
no local PostgreSQL installation, no production deployment or merge of
PR #245 is authorized by this stage.

**`QA_FAILOVER=OFF`**. The PR stays Draft until real end-to-end trust
and recoverability are demonstrated.
