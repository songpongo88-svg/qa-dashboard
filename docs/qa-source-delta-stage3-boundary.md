# QA Dashboard — Step 3 source delta delivery boundary

Status: **Engineering staged, NOT deployed as live synchronization.** This document
applies to PR #210 only. Firestore remains QA primary. The Windows PostgreSQL 17
standby and QA Sparks must remain unchanged until separately authorized.

## Operator-verified Windows state

The November 13 PowerShell screenshots confirm:

- Existing 11-collection 2,226-document point-in-time snapshot staged previously.
- `QA_SOURCE_GUARD=INSTALLED_NO_FIRESTORE_READS`, database backup and private daily ledger verified.
- `QA_DELTA_SETUP=PRIVATE_EMPTY_DELTA_JOURNAL_INSTALLED`, database backup verified.
- `QA_DELTA_LIVE_SOURCE=NOT_CONNECTED` and `QA_FAILOVER=OFF`.

**Do not rerun** either database installer or recapture the entire snapshot merely
to test this gateway. The installed empty journal is not proof of active event
delivery, nor a complete up-to-date replica.

## Isolated transport design (code in PR, not operating)

```text
Firestore QA 11 approved collections
        |
        | Eventarc written events (NOT INSTALLED)
        v
Authorized Google Cloud source producer (NOT IMPLEMENTED)
        |
        | Cloud Tasks durable HTTP delivery (NOT CONFIGURED)
        | -- fresh OIDC token per delivery, dedicated Google service account
        | -- HMAC covering immutable body and original task creation time
        | -- maximum retention <= 7 days, retry on non-2xx
        v
Standalone Cloudflare Worker (NOT DEPLOYED)
  cloudflare/qa-delta-vpc-gateway.mjs
  QA_EDGE_DELTA_ENABLED=0 by default
  verifies source HMAC, bounded queue age and Google JWT shape
        |
        | QA_PRIVATE_DELTA_VPC (NOT BOUND)
        | private route specifically registered to 127.0.0.1:8791
        | DISTINCT fresh private-hop HMAC, original Google OIDC preserved
        v
Windows loopback-only source receiver (NOT STARTED)
  server/qaWindowsDeltaReceiver.js
  validates separate HMAC and Google signature/audience/SA against JWKS
  PostgreSQL role qa_delta_ingester (NOT INSTALLED; NOLOGIN initially)
        |
        v
qa_failover_v1.source_delta_events and source_delta_latest
  ALREADY INSTALLED, currently empty
  event duplicates, stale changes and conflicts recorded
  NO evaluation/appeal/signature/role/session active writes
```

## Fail-closed integration contracts

- Cloud Tasks is **not** a general-purpose Firestore consistency proof. Eventarc
  delivery and Cloud Tasks retries must be independently monitored for missed
  events, queue backlog and dead letters. The private journal may contain
  correct received events while still missing an unknown event.
- The external source signature allows tasks delayed up to **7 days**, because
  a 5-minute-only signature would reject backlogged Cloud Tasks. The second,
  Cloudflare-to-Windows signature remains fresh (5-minute window), and Windows
  independently verifies the Google OIDC identity on every delivery.
- Producer queues must have **maximum task age no greater than 7 days**. Any
  expired/dropped task or backlog older than that is a parity failure requiring
  source reconciliation, never silently skipped data.
- Configure a distinct Cloud Tasks delivery service account. OIDC `aud` must
  exactly match the HTTPS Worker URL with `/v1/qa/source-delta`; the Windows
  receiver pins both audience and service account email.
- Never expose the PostgreSQL port or the Windows 8791 source listener publicly.
  Workers VPC must bind a specific HTTP service, not share the archive 8788 or
  evaluation 8790 binding. Cloudflare Workers VPC is still in beta.
- Signatures, JWTs, database passwords, and Cloudflare credentials belong in
  provider secret storage / on the local Windows machine. Never put secrets in
  GitHub commits, task URLs, Vercel client environment, QA Dashboard UI, logs
  or ChatGPT messages.
- The `qa_delta_ingester` role migration
  `migration/qa-source-delta-ingester-role.sql` intentionally creates a
  **NOLOGIN** role with journal-only access. This migration is **not yet run**
  on Windows. Credential activation requires a separate authorized,
  least-privilege local setup and proof of no permissions on the QA case table,
  outbox or failover state.
- The receiver is disabled unless all `QA_LOCAL_DELTA_*` configuration is
  installed locally. A healthy Windows listener alone cannot change
  `qa_failover_v1.state` or declare source parity.

## Required evidence before claiming Step 3 complete

1. An independently authenticated Google Eventarc producer is actually
   deployed for all 11 QA root collections, without Firestore full-scan loops.
2. Cloud Tasks accepts test events and retries them after simulated
   temporary Windows/VPC unavailability without duplicates or silent loss.
3. A distinct Cloudflare VPC HTTP service can reach Windows loopback 8791;
   both HMAC hops and Google OIDC pass, while anonymous/browser calls fail.
4. An authorized least-privilege Windows DB role records synthetic upsert,
   delete, duplicate, stale and concurrent events; live scores and user
   sessions remain untouched.
5. Complete authoritative per-document/source-hash comparison across
   evaluations, appeals, signatures, users, permissions, sessions and locks.
   Verify a bounded lag and a measurable missed-event detection strategy.
6. Independently certify local login/auth, revocations, editing permissions,
   evaluation/appeal/signature CRUD, attachments and replay/rollback/failback
   under real Firestore quota exhaustion, with no QA Sparks impact.

Only after **all** these checks should a separately authorized deployment
consider failover activation. For now: `QA_FAILOVER=OFF`.

## CI scope and limitation

QA PostgreSQL preview safety checks perform synthetic signing/identity
validation, independent HMAC gateway tests, Windows receiver configuration
validation, isolated PostgreSQL delta journaling and deny-by-default QA rights.
CI does **not** connect to the operator's Windows host, Firestore, Cloud Tasks,
Cloudflare VPC or a QA production session. The unrelated Jan/Feb raw-data
audit workflow is separately failing; this is not proof of a functional
production failover.
