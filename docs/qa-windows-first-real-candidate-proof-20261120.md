# QA Windows — first real reconciliation candidate accepted (20 Nov 2026)

## Windows operator proof (private terminal, aggregate counters only)

The operator executed the reviewed one-time `Create-QA-Windows-Reconciliation-Snapshot.ps1 -Run`
script on the existing Windows PostgreSQL 17 host and shared the following
terminal results:

| Metric | Verified result |
|---|---:|
| Full local PostgreSQL backup | CREATED |
| Reconciliation result | CANDIDATE_ARCHIVED_AND_RECONCILED |
| Frozen original snapshot | 2,226 documents |
| New non-active candidate | 2,427 documents |
| Added | 202 |
| Removed | 1 |
| Modified | 61 |
| Unchanged | 2,164 |
| Changed datasets | 11 / 11 |
| Firestore REST requests | 57 |
| Reserved local document units | 2,850 |
| Source continuity | NOT_CERTIFIED |
| Other client Firestore quota usage | UNKNOWN |
| QA Source Listener | NOT_STARTED |
| QA Failover | OFF |

Accounting check: `2,226 + 202 - 1 = 2,427`,
`202 + 61 + 2,164 = 2,427`, and
`1 + 61 + 2,164 = 2,226`.

**Meaning:** A separately staged, internally verified point-in-time
source archive exists. It does **not** mean the source is continuously
replicated, and it does **not** authorize standby promotion or writes.
The old frozen `active_snapshot_id` was not changed by this operation.

### Next safe verification — zero Firestore reads

Use **Windows PowerShell on the existing backup PC**. The helper is a
separate offline audit and never runs another scan, listener, migration,
cutover, or data mutation. Reviewed wrapper pinned to
`9ecf62b80fdaaaba4607b17d3f59b463bf163f9d` and Node reviewer pinned
to `7ad64d38c11e9ba3a193b3a13049ce2a9fd01656`.
It downloads only immutable source code from GitHub and reads local
PostgreSQL in a read-only session. Local PostgreSQL credentials must be
entered on the Windows host and must not be shared.

```powershell
$p = Join-Path $env:TEMP 'Check-QA-Windows-New-Candidate.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/9ecf62b80fdaaaba4607b17d3f59b463bf163f9d/scripts/Check-QA-Windows-New-Candidate.ps1' -OutFile $p
& $p
```

The helper finds the latest separate copy-verified candidate, recomputes
all document JSON hashes and 11 collection manifests against the archived
baseline, and reports only aggregate counters. A successful recheck reports
`QA_WINDOWS_ARCHIVE_VERIFY=LOCAL_CANDIDATE_HASHES_AND_MANIFESTS_RECHECKED`
and `QA_WINDOWS_ARCHIVE_CHECK=LOCAL_READ_ONLY_RECHECK_COMPLETE`.
The script does **not** provide live Firestore freshness evidence.

A failed local review is a stop signal, not a reason to rerun Firestore
reads or disable guardrails. The one-time capture already reserved 2,850
document-read units in the local budget on 20 November; other provider
clients are not represented in this ledger.

### Release blockers — still OFF

- No continuous, gap-free 11-collection event feed; no authenticated and
  acknowledged Windows source delivery.
- No independently source-verified deletion history or offline-gap
  reconciliation; even an archived removed document cannot prove a
  real-time durable tombstone.
- No source/Windows authorization, sessions, locks, attachments, QA
  mutation/outage/failback parity acceptance on the real host.
- No demonstrated guarantee of quota headroom under reconnect behavior.
- Do not merge this staged work as completed failover, deploy it as live,
  alter the archived source snapshot, or start the source listener yet.

`QA_FAILOVER=OFF` must remain until actual release gates are satisfied.
