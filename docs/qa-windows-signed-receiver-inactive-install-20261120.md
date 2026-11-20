# Windows QA signed receiver: inactive-only installation checklist
## Verified in CI, not installed on the user's Windows machine

**Reviewed branch:** Draft PR #245.

The additive schema in
`migration/qa-windows-signed-receiver-inactive.sql` has passed an
isolated PostgreSQL 17 schema test and a PowerShell syntax check in
[CI run 44714881859](https://github.com/songpongo88-svg/qa-dashboard/actions/runs/44714881859).

The importer is **not** a live receiver, API server, listener, Windows
service or background synchronization tool. Its role is to create a
locked, empty intake table safely and preserve existing Windows data.

### Operator-only prerequisite

- Use **the existing Windows QA backup PC**, Windows PowerShell, and its
  local PostgreSQL 17 at `127.0.0.1:5432`, DB `qa_dashboard_lab`.
- The previous signed metadata stage marker must exist and match the
  earlier reviewed installation.
- `qa_failover_v1.state` must still be disabled and write-frozen.
- The **independently reviewed, archived 2,427-document candidate**
  must still be present. No future source freshness is asserted.
- Never paste the local PostgreSQL password into chat or GitHub.

### One-command preparation and explicit additive installation

The command downloads a pinned immutable wrapper whose SQL file is
pinned separately to commit
`7f728335eb2a4a92cd3318951532a725f6d62780`.

Run in PowerShell on the **backup machine only**:

```powershell
$p = Join-Path $env:TEMP 'Install-QA-Windows-Signed-Receiver-Inactive.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/b58d020b8007a1f1e6045ef417463338d157e3e2/scripts/Install-QA-Windows-Signed-Receiver-Inactive.ps1' -OutFile $p
& $p -Apply
```

`-Apply` triggers an **explicit schema installation only** and
requires the existing local PostgreSQL password. It does the following:
1. Rejects unknown version/marker, enabled failover, missing PG17 tools.
2. Downloads the pinned reviewed SQL only from GitHub.
3. Verifies the existing frozen source snapshot and 2,427-document
   archived candidate locally, with **zero Firestore reads**.
4. Creates a full PostgreSQL `pg_dump -Fc` safety backup in
   `Documents\QA_Backup\snapshot-db-backups` before installing anything.
5. Creates only
   `qa_windows_signed_receiver_v1.stream_cursor` and
   `qa_windows_signed_receiver_v1.inbox` with forced RLS,
   public-access revoked, checks that prevent delivery/failover,
   and no receiver network service.
6. Performs a local, read-only empty-table and frozen-state check.
   Writes an inactive installation marker only if the postcheck passes.

Expected local terminal proof:

```text
QA_WINDOWS_SIGNED_RECEIVER_DB_BACKUP=CREATED
QA_WINDOWS_SIGNED_RECEIVER_INSTALL=PRIVATE_SIGNED_RECEIVER_INSTALLED_INACTIVE
QA_WINDOWS_RECEIVER_LISTENER=NOT_STARTED
QA_WINDOWS_FIRESTORE_READS=0
QA_WINDOWS_SOURCE_CONTINUITY=NOT_CERTIFIED
QA_FAILOVER=OFF
```

If the install reports `BLOCKED_...`, **stop** and retain the backup
for review. Do not clear any marker, remove RLS, rerun a full Firestore
scan or start a listener as a workaround. A previously installed
schema must be reviewed with a separate read-only acceptance check,
not blindly overwritten.

### Remaining work even after this succeeds

This installs only an **empty, private inactive intake table**. It does
not connect to Firestore, authenticate a trusted sender, or implement
durable source ACK, deletion events, QA authorization, offline recovery,
session/lock parity, authoritative source completeness, active snapshot
promotion, or Automatic Failover. The 2,427-document candidate stays
archived and not active; the original frozen standby is unchanged.

**Never infer live sync from this local installation.**
`QA_FAILOVER=OFF` and PR #245 remains Draft.
