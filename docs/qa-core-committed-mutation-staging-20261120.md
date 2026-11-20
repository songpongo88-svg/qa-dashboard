# QA Core replication — next isolated safety stage (20 November 2026)

## Verified previous milestone

- Operator ran real Windows PostgreSQL 17 candidate capture and a second
  local read-only integrity verification: 2,226 frozen original and 2,427
  new copy; added 202, removed 1, modified 61, unchanged 2,164.
- All 11 archive manifests and per-document hashes passed locally.
- The original active snapshot remains frozen. The 2,427-row candidate is
  **not** active and is **not** proof of gap-free real-time replication.
- The recheck consumed **zero** additional Firestore document reads.
- Keep QA Source Listener stopped and QA_FAILOVER=OFF.

## This follow-on code stage (not live)

1. The new source-only inventory scanner traverses src, api, server and
   scripts and reports possible Firestore mutation files. It continues to
   inventory the existing 11 QA collections, and highlights additional
   writer leads, including files outside the previously known writer list.
   Regex detection is not exhaustive; dynamic SDK calls, bundled client
   scripts, external writers, other Firestore projects and Storage objects
   still require manual review. The audit always reports BLOCKED.
2. The private, disabled-by-default qaCoreMutationCoordinatorStage module
   composes the existing durable pending-intent and uncertainty quarantine
   operations. A server-authorized intent must be durably staged before a
   trusted source write can be attempted. A replay of an existing operation
   **must not** resubmit the source write. A source timeout/error is treated
   as uncertain and quarantined, not as a known rejected commit.
3. Even when the synthetic write callback resolves, the outbox stays
   pending; no source-confirmed status, delivery, or failover is claimed.
   Source identity, exact revision, timestamp order, idempotent Windows
   delivery and deletion/tombstone evidence must still be established.
   Delete operations are intentionally unsupported by this coordinator
   until an authoritative deletion proof and ordering strategy exist.
4. CI tests these guards with fake source callbacks and an isolated
   PostgreSQL 17 database. It uses no real case data, source reads, Windows
   secrets, Supabase mutation, Cloudflare services or Vercel deployment.

## Required release gates

- Real server identity and authorization (roles, sessions, edit leases,
  month locks); do not trust frontend assertions.
- Complete all-source write path inventory and migrate actual browser QA
  mutations to the server-authorized entrypoint without breaking
  evaluation, appeal, signature and account operations.
- Independently verify committed Firestore source revisions, deletes,
  and uncertain outcomes; persist exact ordered events before ACKs.
- Private authenticated Windows receiver with durable ACK/replay,
  sequencing, collision guards, gap detection and restart recovery.
- Test real end-to-end QA CRUD, signatures, attachments, edit locks,
  session revocation, offline gaps, disaster recovery and failback.
- Only after explicit full parity and security acceptance should
  production failover or local standby writes be considered.

**No operator action needed for this stage. Do not rerun any full Firestore
scan or promote the 2,427-document candidate.**
