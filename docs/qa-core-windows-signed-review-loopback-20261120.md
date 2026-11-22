# QA Core → Windows signed review sender laboratory (20 Nov 2026)

## Evidence and scope

The real Windows PostgreSQL 17 snapshot was previously copied and integrity-reviewed:
**2,226 documents** in the original frozen snapshot and **2,427 documents**
in a newer archived candidate, across 11 QA Core datasets. Neither one
is updated or promoted by the work described here.

The staged code now composes a private QA source-side **review-only** signed
sender queue with the previously tested Windows **review-only** receiver
in disposable PostgreSQL 17. It is a synthetic loopback running against
`qa_cutover_ci_test`, **not a live Windows, Firestore, Supabase or Cloudflare
connection**.

### Implementation

- `migration/qa-core-signed-review-sender-lab.sql`: private,
  RLS-forced, per-stream cursor and signed envelope spool. No access
  for public/browser roles, no public RPC, webhook, scheduler or
  automatically installed migration.
- `server/qaCoreSignedReviewSenderLab.js`: disabled by default.
  Requires a provided in-memory Ed25519 private key with both signer
  fingerprints pinned, active `QA_FAILOVER=OFF`, and the **disposable**
  `qa_cutover_ci_test` database. Reads only a previously staged
  pending QA intent and its separately recorded, review-only source
  evidence candidate. Checks the stored document, intent, typed-fields
  and hashes before signing. Atomically records sequence, signature
  and envelope in a transaction; a duplicate operation ID is replayed
  with the same original bytes and sequence, not signed as a new event.
- `scripts/test-qa-core-windows-signed-review-loopback-integration.mjs`:
  uses two independent PostgreSQL connection pools and generated test
  keys. Generates exactly one synthetic record per all **11 QA datasets**.
  Tests a concurrent duplicate, gap/reordering, retransmission after an
  intentionally omitted transfer, modified/tampered message, replay of
  the exact original signature, and blocked uncertain source state.
  Exercises receiver constraints that force review-only delivery and
  failover booleans to false.

**All sender source candidates used by this test are synthetic database
fixtures.** In particular, the presence of a row in the private
`source_verification_candidates` lab table does not constitute an
independent Firestore commit certificate. This flow is not safe to
activate in production, nor does it guarantee any source event coverage.

### Verified CI

The PR safety workflow passed both jobs in
[GitHub Actions run 44706800937](https://github.com/songpongo88-svg/qa-dashboard/actions/runs/44706800937):

- `no-network-unit`: success.
- `isolated-postgres`: success.
- Log: `PASS QA Core-to-Windows review-only loopback PG17: all 11 datasets, durable signing spool, lost/reordered replay, blocked uncertain source, zero real Firestore reads`.

The test intentionally leaves the source intent `pending/waiting`, sender
`delivery_authorized=false` and `delivery_acknowledged=false`,
receiver `review_required`, and `QA_FAILOVER=OFF`.

### Remaining production release gates

1. Actual trusted server-side QA mutation gateway and complete prevention
   of browser/admin bypass across all 11 collections.
2. Firestore source commit evidence and authoritative delete/tombstone
   events; no inferred deletes from a 404.
3. Authenticated network transport, real Windows receiver installation,
   private keys in a secure store, durable authenticated acknowledgments,
   replay and restart recovery. A cryptographic signature alone cannot
   establish source completeness or authorization.
4. Quota-safe backlog management, attach/signature/session/lock consistency,
   end-to-end record parity, disaster failover and failback rehearsals.
5. Independent sign-off before a production rollout.

**No operator PowerShell steps, new Firestore scan, active Windows
snapshot change, production deploy or PR merge are requested.
Keep the Draft PR and `QA_FAILOVER=OFF`.**
