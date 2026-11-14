# QA Windows — REAL new candidate snapshot in one command

Status: **Code and synthetic end-to-end tests passed. Real Windows
candidate has NOT yet been created. Production failover stays OFF.**

## Current real evidence

- Existing Windows PostgreSQL 17: frozen baseline verified, **11 datasets
  / 2,226 documents**, backed up.
- One real Firestore parity check: **2,266 source documents**, **8 of 11
  collections differ** from frozen baseline, **2,700 reserved read units
  and 54 REST requests**.
- Document list permission verified. Snapshot restoration, continuous
  source capture and failover are not verified.
- Previous parity on 2026-11-14 in Thailand consumed this day's local
  read budget. Do not repeat the full scan today.

## Single real operator command

The code is at:
`scripts/Create-QA-Windows-Reconciliation-Snapshot.ps1`

The wrapper fetches immutable reviewed sources pinned to
`9b17d6703e1fb4effd707e773825e5fe132a8038`, including
`scripts/Run-QA-Windows-Reconciliation.mjs` and the stage/review modules.

Run in **Windows PowerShell on the existing backup PC only**, in a new
Firestore quota window and only when the dashboard is not under pressure.
The explicit `-Run` makes ONE attempt; without `-Run` it makes **zero
Firestore calls**. Never paste PostgreSQL passwords, ADC JSON or tokens
into GitHub, chat or a browser.

```powershell
$p = Join-Path $env:TEMP 'Create-QA-Windows-Reconciliation-Snapshot.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/dd1735e311e0ed281ac24f9f2f7cfb3d50b53be2/scripts/Create-QA-Windows-Reconciliation-Snapshot.ps1' -OutFile $p
& $p -Run
```

The wrapper checks the previous inactive stage, local gcloud project and
credentials, obtains a **fresh full local pg_dump backup**, and runs the
private Node pipeline.

The Node pipeline:
1. Verifies frozen original 11-dataset SHA-256 manifest and local
   PostgreSQL 17 schema.
2. Checks remaining local quota reservation cap before any GET.
3. Rejects another full-source scan on the **same Pacific quota day**,
   including across UTC midnight; waits two hours after the Pacific
   reset window for a conservative cushion. This uses prior attempt
   marker modification times. Firestore official reset is around
   midnight Pacific, not UTC.
4. Atomically creates a once-per-UTC-day attempt marker; no retry.
5. Uses private ADC and a **single readTime** to read 11 QA collections
   using only Firestore REST GETs, max pageSize=50, 80 requests, and
   3,000 conservatively reserved Firestore document units. **Reads
   may consume real provider free quota; this is not a zero-cost scan.**
6. Saves a **new unique candidate snapshot ID** into
   `qa_failover_v1.live_snapshot_batches/rows`, keeping the original
   `active_snapshot_id` unchanged; copies typed Firestore JSON,
   validates 11 hashes and rereads PostgreSQL to verify content.
7. Compares old/new local snapshots and reports only totals:
   `QA_RECONCILE_ADDED`, `REMOVED`, `MODIFIED`, `UNCHANGED`,
   `CHANGED_DATASETS`, old/new document counts and read reservations.

Expected successful local status (not observed yet):
`QA_RECONCILE=CANDIDATE_ARCHIVED_AND_RECONCILED` and
`QA_WINDOWS_RECONCILE=NEW_SNAPSHOT_CREATED_AND_VERIFIED_NOT_ACTIVE`.

On any preflight, source, quota or SQL failure, it exits nonzero,
maintains original frozen copy, never enables standby writes, and cannot
claim a completed backup. The user can send only the status counters
from PowerShell to continue; no passwords or documents.

**Important:** The local daily reservation ledger has NO live visibility
of read usage by other production clients; no guarantee of free quota.
Do not force reruns if quota or permissions block the scan.

## After real candidate

The candidate is a **point-in-time archive**, not an online source mirror.
An independently tested 11-collection continuous journal including edits
and deletions, durable Windows receiving ACKs, offline-gap reconciliation,
sessions/login/permissions, QA case/appeal/signature writes, attached
documents and safe failback still need verification.

The source and case database remain unchanged. No source listener,
Vercel Production deployment, PR merge or cutover is part of this step.
`QA_FAILOVER=OFF`.
