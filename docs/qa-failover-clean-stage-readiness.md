# QA Core failover — clean independent step (2026-11-14)

This is a **standalone, safe no-billing outbox staging PR**, forked from main at
`91b41e0` to avoid importing unrelated QA Sparks/theme/session changes from
the 315-commit conflict in the previous draft PR #210.

## Verified connected environments

- Google Firestore project `qa-dashboard-b0b5d` had Billing disabled, so
  Eventarc/Cloud Tasks cannot be enabled without user-initiated billing.
- Supabase PostgreSQL project `vyhleszztvchevncgkhd` already contains the
  `qa_core_replication_stage.change_outbox` schema installed under a separate
  migration; last verified zero records and denied public/browser access.
- User's local Windows has an existing frozen PostgreSQL 17 snapshot,
  Delta Journal, and `qa_delta_ingester` NOLOGIN role.
- Production Vercel continues on `main`, not on the old draft failover branch.

## What this clean PR does

- Carries **inert** stage-only SQL and internal Node functions to the current
  code base, with a fail-closed pending-intent/quarantine model.
- Adds independent Node and PostgreSQL 17 CI safety tests.
- Documents identified direct Firestore write paths for 11 QA collections,
  not a claim of exhaustive real-time capture.

## What this PR does NOT do

- Does **not** deploy a Cloudflare Worker, enable a route, edit QA pages,
  connect to Firestore, or copy user data.
- Does **not** enable public access, grant service_role to the private schema,
  create timers/webhooks/triggers, or authorize QA case/appeal/signature writes.
- Does **not** turn on local Windows receiver, change GitHub production,
  merge #210, or activate failover.

## Production gate

`QA_FAILOVER=OFF` must remain in force until all direct Firestore writers
are either migrated to a trusted, server-authorized mutation path with a
durable committed journal **or** covered by a verified continuous source
capture with full reconciliation; the Windows ingress/failback, permissions,
QA Sparks separation, and outage recovery all require real host verification.

This clean PR is a prerequisite you can review independently, not a promise
that failover is complete. No user needs to rerun previous Windows installers.

## No-Google-Billing Windows Firestore change probe (stage only)

GitHub PR #245 includes \`server/qaWindowsSourceProbe.js\` with a **read-only,
disabled-by-default** change notification adapter and no scheduled activation.
It is an engineer test helper, not a deployable production listener.

- Uses 11 query snapshot listeners only after explicit \`QA_WINDOWS_SOURCE_PROBE=1\`,
  \`QA_FAILOVER=OFF\`, a separately attested local source identity for project
  \`qa-dashboard-b0b5d\`, exact expected document IDs for all collections,
  and a **persisted** initial read-budget reservation.
- Never counts the initial \`added\` set as new data. Must first see exact
  ID parity on each collection. If a document differs from the stored
  baseline, or a collection changes during bootstrap, stops and requires
  source reconciliation.
- Emits **metadata only** after baseline: collection, document ID and change
  type. No case content is copied, and the signal is **not authoritative**
  without a later verified REST source read. If durable storage or listener
  fails, it detaches and requires reconciliation.
- Stops after 15 minutes. **This is NOT a hard billed-read cap** because
  the Firestore SDK can reconnect invisibly; additional reads may occur
  before the callback receives a notification. The probe must remain OFF
  until credential provenance, daily ledger, global quota headroom and
  reconnect behavior are validated on Windows.
- Firebase documentation confirms the Spark-plan default database permits
  50,000 free document reads per day, but all QA sessions share the same
  quota. This probe must not be treated as "free unlimited sync".
- No Windows installer, credentials, Firebase URL, Cloudflare worker,
  Vercel deployment, public endpoint or \`qa_failover_v1\` writer was created.

This does **not** make continuous replication reliable. Offline gaps,
deletions, revised document payloads, lost events, attachments, permissions,
locks, session revocations, parity and failback remain release blockers.
