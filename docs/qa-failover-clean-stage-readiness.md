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
  ID **and microsecond updateTime parity** on each collection. If a
  document is changed (even when its ID is the same), missing from the
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

## Budgeted canonical REST document follow-up (staged)

The Windows listener probe delivers only change metadata. This PR now also
contains `server/qaWindowsSourceDocumentReader.js` for **one explicit,
opt-in, server-authenticated Firestore REST GET per signalled document**
after the caller reserves one read unit in its private daily ledger.

It verifies the exact full source document path, uses Firestore typed
`fields` JSON and compares the exact microsecond `updateTime` observed
by the listener before returning the source hash. Missing documents,
recreated documents, source revision races, quota or credential errors are
**never** silently sent to Windows as valid events. A 404 requires
reconciliation, because absence is not proof of the original deletion
revision. No cloud credentials are committed or fetched here.

**Neither component is started or connected** to Windows, Cloudflare,
Firestore production, the Supabase outbox, or a failover receiver. A
source-verified read is not continuous-source parity or permission proof.

## Copy-verified Windows snapshot manifest (stage only)

- The read-only helper 'server/qaWindowsProbeBaseline.js' reads the existing
  frozen 'qa_failover_v1.live_snapshot_rows' and validates the stored
  11-collection SHA-256 manifests and exact Firestore 'updateTime' revisions.
- A missing, changed or unverifiable document aborts before returning any
  expected ID/revision list. No Firestore reads or PostgreSQL mutations occur.
- The manifest can be passed to 'startQaWindowsReadOnlyProbe' **after** the
  separate source credential attestation and a durable read-budget
  reservation. It is NOT evidence of live parity.
- These source modules still require Windows installation and an independent
  real-host acceptance test; neither was started here.

## Integrated private staging composition — no automatic start

- Implemented 'qaWindowsSourceSignalJournal.js' and an additive,
  Windows-only migration for 'qa_windows_probe_v1.source_signals'.
  The private metadata events have no QA case payload and are always
  source-unverified and reconciliation-required; SQL constraints
  explicitly prohibit claiming source success or cutover readiness.
- Implemented 'qaWindowsProbeBaseline.js' to read the **existing** frozen
  'qa_failover_v1.live_snapshot_rows', verify 11 collection counts and
  SHA-256 digests, derive exact microsecond 'updateTime' values, and
  fail closed if any copied document has changed.
- Implemented 'qaWindowsPrivateSignalStage.js' as a **disabled-by-default
  private composition** connecting the read-only baseline loader,
  11 Firestore listener probes and durable local signal persister.
  Its complete flow is tested against fake source and local DB interfaces.
  This is NOT a runnable background service, scheduled listener or
  configured Windows host.
- The additive local signal migration has only been tested with a disposable
  PostgreSQL 17 instance in GitHub CI. It was **not installed** on the
  user's Windows machine. The existing Supabase outbox is still separate;
  its contents have not been copied or mutated by this branch.
- Need real Windows database connection and credential attestation,
  a dedicated source-read budget ledger for SDK reconnects,
  missed-event reconciliation, verified payloads/deletions, and end-to-end
  authenticated transport and failback before production activation.

## Manual Windows preparation installer (added 14 Nov 2026)

- `scripts/Install-QA-Windows-Private-Signal-Stage.ps1` uses the EXISTING
  `$HOME\Documents\QA_Backup\source-stage`, PostgreSQL 17 and
  `qa_dashboard_lab`. **Default call is preflight-only and does not use
  Firestore, download files, or modify the database**.
- The explicit `-Apply` mode requires previous delta schema and receiver
  markers, the frozen snapshot, exact PostgreSQL version, and a fresh local
  `pg_dump -Fc` backup. It downloads files pinned to commit
  `b4edc5101285d3e85ccafaba9a076c3553756879`, installs ONLY the
  private metadata-only schema, and copies staged Node modules into the
  existing source-stage directory with local recovery copies.
- It does NOT launch listeners or scripts, connect to Firestore, edit case
  scores, modify existing bridge ports, or enable standby writes. Even
  after `-Apply`, `QA_FAILOVER=OFF`.
- No execution on the user's Windows host has happened from this PR.
  The installer must be run locally and its output inspected before any
  future manual source listener probe.
