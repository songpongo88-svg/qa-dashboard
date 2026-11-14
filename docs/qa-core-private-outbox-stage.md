# QA Core private outbox — no-Google-Billing candidate

**STATUS (2026-11-14): EMPTY PRIVATE SCHEMA APPLIED TO EXISTING SUPABASE, NOT INTEGRATED WITH QA WRITES OR WINDOWS.**

## Verified Supabase staging installation (2026-11-14)

- Applied the exact additive migration in this PR to the connected existing
  Supabase PostgreSQL 17 project. This added only
  `qa_core_replication_stage.change_outbox`; it did not alter existing
  `public`, `qa_sparks_identity`, or `sparks_runtime` objects.
- Verified with read-only SQL on that database: **0 outbox rows**, RLS enabled
  and forced, no `anon` schema usage, no `anon` SELECT,
  no `authenticated` INSERT, and no `service_role` INSERT.
- The Supabase security advisor's "RLS enabled, no policy" INFO finding on
  this isolated stage is **intentional deny-by-default**. Do not add browser
  policies or grant writes as a workaround.
- This does not deploy a Vercel mutation service, connect Windows, establish
  event provenance, or authorize failover. The stage is deliberately inert.

The existing Supabase project contains QA Core and QA Sparks tables; this
migration deliberately creates an **isolated, private** schema and never
modifies existing public QA or sparks tables, policies or permissions.

The future authoritative QA mutation service must validate identity,
revocation, monthly/evaluation/appeal/signature locks and per-document
versions **server-side** before attempting a write. Every mutation needs
a unique operation ID and a transactionally durable intent. The outbox uses
three source states: pending, source_confirmed and needs_reconcile. Only
source_confirmed records may be leased for private delivery, and even then
a Firestore-success / Supabase-confirmation failure requires separate
reconciliation; **this design does not make two databases atomic**.

The queued event must be content-hashed and protected from client edits.
Only an isolated trusted backend should eventually have the minimum SQL
permissions required. Anonymous/authenticated/service roles have no access
to this candidate schema; never enable browser access or share DB keys.
Existing Cloud Tasks Google-OIDC gateways cannot simply be reused for this
non-Google backend: separate authenticated transport and independent receiver
verification are required.

PostgreSQL CI exercises schema checks, duplicate operation rejection,
pending-vs-confirmed delivery gating, a synthetic lease and an ack. **CI
does not perform real end-to-end source replication**.

Release blockers: complete interception of 11 QA datasets, version
consistency, dedicated authenticated backend, durable source acknowledgment,
verified replay on Windows with a non-Google sender identity, consumer
retries/dead-letter alerts, independent parity, local login/roles/locks,
attachment handling and failback. Keep QA_FAILOVER=OFF and PR Draft.


## Pending write outcomes and quarantine (2026-11-14)

- Commit `e71f948` uses PostgreSQL `jsonb` equality for duplicate
  operation IDs. JSON object key order is not a mutation conflict; a changed
  score or document path with the same operation ID remains a hard failure.
  Both unit and disposable PostgreSQL 17 tests cover this.
- Commit `6b2ecd5` adds `server/qaCoreOutboxUncertainty.js` to
  stage-only code. If a future trusted server cannot establish whether a
  Firestore source mutation succeeded, it may atomically quarantine an
  existing **pending** operation as
  `source_state=needs_reconcile,delivery_state=blocked`. An already
  committed/delivered operation cannot be downgraded to uncertain.
  Quarantine is idempotent and cannot trigger a Windows delivery.
- These functions are **not currently exposed to browser clients, Vercel or
  Supabase RPC**. They require a separately authorized server attestor,
  an explicit server-side feature flag, and a private PostgreSQL connection.
  A caller-provided object must never be accepted as proof of Firestore
  mutation success. No function in this stage claims a source commit.
- The live Supabase table still has **zero records** at the last checked
  read-only query. The staging receiver on Windows remains `NOLOGIN`
  and `NOT_STARTED`. There is no actual source event producer or live
  consumer connected to this outbox.

