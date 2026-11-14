# QA Windows point-in-time parity diagnosis — no Google billing activation

After verified local Windows PostgreSQL 17 (11 datasets / 2,226 frozen rows)
and confirmed `qa_evaluations` list permission, this PR adds an optional
**read-only comparison** of *all 11 collections* at a single Firestore
`readTime`. The goal is to determine if the old frozen snapshot is still
identical; this is not a live mirror or backup promotion.

- `scripts/Check-QA-Windows-Source-Parity.ps1` is disabled by default:
  only explicit `-Run` can make source reads. It obtains ADC and local
  PostgreSQL credentials on Windows without printing either, downloads
  immutable source files pinned to a reviewed commit, then runs the checker.
- The Node runner validates frozen snapshot digests, 17.x PostgreSQL version
  and available **persisted** read reservations before any HTTP GET.
  The local daily attempt marker is exclusive and cannot be auto retried.
- The source reader uses `readTime` once across all 11 collection pages.
  Page size is **50**, at most **80 requests** and at most **3,000
  conservatively reserved document units** from the shared local read ledger
  (which already contains the completed one-page permission test).
  The script never refunds failed or timed-out reservations.
- It compares 11 source manifest SHA-256 digests and document counts to the
  frozen Windows snapshot. Outputs only aggregate counts and a
  `MATCHED_AT_SINGLE_READ_TIME` or `DIFFERS_FROM_FROZEN_COPY` status;
  no case contents, document IDs, passwords or bearer tokens are printed.
- **A matching result proves parity only at that pinned readTime.** It does
  not prove future changes are captured, session/role/attachment parity,
  that quota remains free, or failback. No Firestore or standby QA data
  is modified; the only database write is to the durable read-budget ledger
  and a local one-attempt marker.
- Users must be told that a complete scan of ~2,226 documents consumes
  quota even on the free Spark plan, and production uses the same quota.
  There is no forced scan or scheduled task, and `QA_FAILOVER=OFF`.

The GitHub CI tests use only synthetic data and disposable PostgreSQL 17.
The command is **not yet run on the user's Windows host**.
