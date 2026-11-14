# QA Core private outbox — no-Google-Billing candidate

**STATUS: SCHEMA/CI ONLY; NOT DEPLOYED TO SUPABASE OR WINDOWS.**
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
