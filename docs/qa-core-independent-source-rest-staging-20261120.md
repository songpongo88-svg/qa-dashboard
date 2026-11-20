# QA Core safe source-read adapter — CI-only verification (20 Nov 2026)

## Context

The Windows PostgreSQL 17 host has a manually captured and independently
hash-verified **2,427-document** QA candidate archive across 11 collections.
The previous 2,226-document snapshot is still frozen and active only as a
reference baseline. No continuous delta feed is certified.

This change implements and tests a strict **one-document** independent
Firestore REST reader to support the future source-commit evidence stage.
It does **not** activate any source feed.

## Added

- `server/qaCoreIndependentSourceReadStage.js` —
  requires isolated test flags, an explicitly supplied HTTP function,
  server-only OAuth token, canonical QA document path and microsecond
  revision; it has **no default live fetch function**. Validates one
  Firestore REST Document GET response: exact resource name, typed fields,
  update revision, JSON media type, maximum 1 MiB body, no redirects,
  no retries.
- The source adapter requests exactly one durable budget reservation
  *before* a GET. The fixture composes it with the existing
  `createQaSourceReadBudget` PostgreSQL reservation ledger; a failed GET
  never refunds a reserved unit.
- `scripts/test-qa-core-independent-source-read.mjs` covers bad
  identity, wrong collection, invalid revision, missing credential,
  quota rejection, 404, 429, HTML response, source mismatch, changed-again
  revision, network timeout and large payloads using **mock HTTP only**.
- The disposable PostgreSQL 17 integration in
  `scripts/test-qa-core-source-verification-candidate-integration.mjs`
  uses the injected REST adapter and a real **isolated PG budget table**.
  Even if both test attestations match, the candidate remains
  `review_required`, `delivery_eligible=false` and
  `source_continuity_certified=false`; the outbox remains pending.
- The GitHub workflow checks these modules without Firestore secrets,
  real provider quota consumption, production database writes, Windows
  Listener startup, or failover.

## Security and release boundary

This is not a production OAuth service or an authenticated mutation
endpoint. Strings asserting source authority in injected test fixtures do
not themselves prove a real committed write, and an independent GET at
the expected revision cannot prove all clients were intercepted.
No client-provided roles, timestamps, status booleans, or source receipts
can be trusted as production authorization.

Before any live rollout, implement a server-authorized QA write boundary
covering every relevant Firestore writer, a durable private journal,
server-acquired commit receipts plus bounded independently authorized
source checks, verified ordered tombstones and Windows authenticated ACK
delivery; then rehearse offline gaps and failback. Do not infer no-loss
guarantees from a point-in-time snapshot or a matched document hash.

Do **not** rerun the bulk Firestore scan, enable a timer, add an API route,
merge/deploy this draft as live replication, promote the candidate,
alter QA scores or start failover. **`QA_FAILOVER=OFF`.**
