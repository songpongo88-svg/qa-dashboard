# QA Core automatic backup / failover: production unblocking decision (20 Nov 2026)

## What is actually verified

- Windows PostgreSQL 17: manually captured, SHA/manifests-verified
  **2,427-document, 11-collection** point-in-time archive; separate
  original frozen **2,226-document** baseline. This is **not** a
  continuously replicated standby.
- Connected Supabase PostgreSQL 17 was queried read-only on 20 Nov:
  `qa_core_replication_stage.change_outbox` has **0 events** and the
  staging schema currently has **1 table**. None of the later lab-only
  migrations in this PR have been applied to production.
- Connected Vercel project `qa-dashboard` continues deploying
  `main`; PR #245 remains **Draft and unmerged**, no live
  source collector or Windows receiver was deployed by this work.
- Repository audit: QA frontend uses direct `firebase/firestore`
  mutation APIs in evaluation, appeal, signature, profile/roles,
  session, monthly lock, migration and settings writers. In particular,
  `src/sessionStore.ts` creates/revokes session records from the
  **browser**, and `src/App.tsx` maintains user/login state.
  These client assertions are not equivalent to a server-verifiable
  QA identity and scoped authorization.
- The signed sender/receiver and source evidence modules developed in
  PR #245 work only against disposable `qa_cutover_ci_test` PG17
  fixtures. Their signatures prove **fixture message integrity**, NOT
  that all real Firestore writes were captured.
- Branch history was safely synchronized with a current `main`
  commit while preserving every existing main file; PR #245 was
  observed GitHub-`mergeable=true`. That is a Git merge assessment,
  not a security or production failover acceptance.

## Chosen design constraint: no new Google billing

Firestore Cloud Functions/event triggers require a Blaze billing
project. Google documents that events are at-least-once and may arrive
out of order. A Firestore SDK listener also incurs reads and re-reads
on reconnect. Therefore **an always-on listener + external events cannot
truthfully provide a guaranteed zero-cost, gap-free backup** under the
existing no-billing constraint.

The only viable **no-new-Google-billing** engineering path for new
mutations is a **server-authorized write gateway** backed by a
durable private outbox: all browser, API, scheduled and administrative
writers of all 11 QA collections must be migrated to it, with
Firestore direct-write access removed **only after full parity and
authorization tests**. This still consumes normal Firestore reads/writes
and may consume Vercel/Supabase quota; it is **not free of all costs**.

## Real work required before release (not yet completed)

1. **Identity and authorization.** Replace client-trusted QA
   username/role/password/session assertions with server-verified
   authentication. Securely migrate identities, session invalidation,
   role permissions, month result locks and edit leases; reject requests
   that cannot be verified. Never reuse Sparks authentication as QA
   authorization without a verified mapping and approval.
2. **Authoritative write gateway.** Preserve existing application
   semantics for evaluation scores, appeals, signatures, monthly
   calculations, teams, role management, settings, drafts and sessions.
   Add immutable operation IDs and preconditioned Firestore writes.
   Put every mutation into a private journal **before** attempting
   its source write. An ambiguous source timeout must be reconciled,
   not silently retried or acknowledged.
3. **All-writer closure.** Inventory and migrate 11 dataset writes
   from `src/`, `api/`, scripts, special migration utilities and
   any external tools; include creates, updates, merges, deletes and
   transactions. Prove old browser clients can no longer bypass the
   server boundary. Perform the authorization cutover as one controlled
   release, not half-migrated production.
4. **Source-committed version history.** Verify every source revision
   independently, support authoritative deletion tombstones and
   distinguish source gaps from network and callback failures.
   A single point-in-time GET or listener event is not a complete
   source write journal.
5. **Private Windows receiver.** Independently install/authenticate
   the receiver on the actual Windows host, store keys safely, use
   TLS with mTLS or equivalent strong sender authentication, persist
   signed events with durable ACKs, replay, ordering and restart-gap
   repair. Preserve the two original snapshots until acceptance.
6. **Recovery acceptance.** Compare all 11 latest source manifests
   and document content, prove attachments and authorization parity,
   test quota exhaustion, concurrent mutations, lost ACKs, Windows
   offline gaps, source outage, failover and failback. Require
   independent operator review. Only then enable `QA_FAILOVER`.

## Explicit release decision

**NOT READY FOR LIVE AUTO-BACKUP OR AUTOMATIC FAILOVER.**
Do not merge PR #245 as a completed release; do not add an always-on
source listener, deploy a half-migrated QA write gateway, enable
Windows standby writes, promote the 2,427 candidate, or rerun the
full Firestore export as a substitute for delta capture.

Current known authoritative state:
- QA production continues on Firebase/Firestore.
- Supabase QA change outbox: **0 events** at inspection.
- Source continuity: **NOT CERTIFIED**.
- Receiver at real Windows host: **NOT INSTALLED/VERIFIED FOR LIVE EVENTS**.
- `QA_FAILOVER=OFF`.

### References

- [Firebase Functions deployment requires Blaze](https://firebase.google.com/docs/functions/get-started)
- [Cloud Firestore trigger at-least-once and ordering limitations](https://firebase.google.com/docs/functions/firestore-events)
- [Firestore read/listener pricing](https://firebase.google.com/docs/firestore/pricing)
- [QA review-only loopback results](qa-core-windows-signed-review-loopback-20261120.md)

This document contains aggregate checks and public source-path names
only; no user case data, secrets, or credentials.
