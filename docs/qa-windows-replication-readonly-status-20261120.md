# Windows QA replication status — zero Firestore reads (20 Nov 2026)

This is the next **read-only local check**, not a live backup job or
permission to enable failover. The most recent Firestore source parity was
2,266 documents versus the frozen local baseline of 2,226, differing in
8 of 11 datasets. Supabase private QA outbox had zero rows on 20 Nov.

## Run once on the existing Windows backup PC
This exact script is pinned to reviewed commit
`01dacbe6f78b8a4d19768e04a14a07f0ffecf20a`.
Use **Windows PowerShell**, not the GitHub CI terminal:

```powershell
$p = Join-Path $env:TEMP 'Check-QA-Windows-Replication-Status.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/01dacbe6f78b8a4d19768e04a14a07f0ffecf20a/scripts/Check-QA-Windows-Replication-Status.ps1' -OutFile $p
& $p
```

The command asks for the **existing local PostgreSQL password** securely,
which must never be pasted into chat, GitHub, logs, or screenshots. The
password is discarded when the script exits. There are no Firestore API
calls, Google Cloud billing changes, credentials published, listener
starts, migrations, writes, or QA score changes. The PostgreSQL session
enforces `default_transaction_read_only=on`.

Expected output fields (values must be observed, **not assumed**):

- `QA_WINDOWS_POSTGRES=LOCAL_PG17_FROZEN`
- `QA_WINDOWS_ACTIVE_SNAPSHOT_ROWS=<number>`
- `QA_WINDOWS_SOURCE_SIGNAL_ROWS=<number>`
- `QA_WINDOWS_SOURCE_DELTA_EVENT_ROWS=<number>`
- `QA_WINDOWS_SOURCE_DELTA_LATEST_ROWS=<number>`
- `QA_WINDOWS_VERIFIED_CANDIDATE_ROWS=<number or NOT_INSTALLED>`
- `QA_WINDOWS_REPLICATION_CHECK=LOCAL_READ_ONLY_STATUS_COMPLETE`
- `QA_WINDOWS_SOURCE_CONTINUITY=NOT_CERTIFIED`
- `QA_FAILOVER=OFF`

If the script returns `SAFE_CHECK_FAILED_NO_CHANGES` or another failure
status, stop: do not disable the read-only guard, change Windows roles,
rerun a Firestore parity scan, or enable the listener as a workaround.

**Next decision:** If signals/deltas are still zero, the system has no
demonstrated continuous source capture and needs a separate operator-
reviewed capture/receiver stage. A nonzero count alone does not prove
source-authoritative delivery, deletion correctness, or failover readiness.
Keep the original frozen snapshot, no production cutover, and no automatic
Firestore reading until the source budget and gaps are fully controlled.
