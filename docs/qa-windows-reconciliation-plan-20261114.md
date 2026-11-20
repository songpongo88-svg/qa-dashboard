# QA Windows Reconciliation — 14 November 2026

## Grounded local evidence

The operator ran the reviewed Windows PowerShell read-only, point-in-time
QA Firestore comparison against the frozen `qa_dashboard_lab` copy.

| Result | Recorded value |
| --- | --- |
| Project | `qa-dashboard-b0b5d` |
| QA source collections | 11 |
| Frozen Windows Snapshot | 2,226 documents |
| Source Firestore at pinned readTime | 2,266 documents |
| Dataset manifests with differences | 8 of 11 |
| Local document-read units reserved | 2,700 |
| REST GET requests | 54 |
| Source continuity | NOT CERTIFIED |
| QA source listener | NOT STARTED |
| QA failover | OFF |

The **net total difference is +40 documents**, not proof of precisely
40 additions: deletions, edits and additions may coexist. The parity check
does not disclose which 8 collection manifests differ or which documents.

## Safe, staged reconciliation sequence

1. **Keep the old frozen archive.** Do not alter or delete
   `qa_failover_v1.state.active_snapshot_id`, existing Snapshot rows,
   evaluations, appeals, signatures, role/session tables or QA Sparks.
2. **Do not repeat the full scan during the present UTC-day quota window.**
   Local reservations already account for the earlier one-page permission
   check and the 2,700-unit point-in-time scan. Usage by other QA clients
   is unknown; the local budget ledger is not a global provider quota view.
3. **Capture a future new candidate** only after verifying Firestore
   read quota headroom and choosing an operator-approved off-peak period.
   Use trusted local ADC, one common source `readTime`, full typed fields,
   all 11 collections, durable reservations before each REST GET, no retries,
   and a new unique `snapshotId`. A change in source contents between
   page reads is addressed by using the same `readTime`.
4. **Copy candidate into a new archive**, not over the original.
   The stage-only `qaWindowsCandidateArchiveStage.js` enforces that
   `QA_FAILOVER=OFF`, the old active Snapshot remains frozen, and
   the candidate is newer. `stageQaFirestoreExport()` now holds a
   PostgreSQL `FOR SHARE` lock on frozen failover state during the copy.
   The candidate must pass both 11 dataset source manifest hashes and
   PostgreSQL reread/content-hash checks before marking it
   `copy_verified`. All `approved_for_failover` fields remain false.
5. **Review both copies offline**, with the read-only
   `qaWindowsReconciliationReview.js`, which checks hashes again and
   reports only aggregate counts of `added`, `removed`, `modified`,
   `unchanged`, and changed collection count; never case IDs or contents.
   No additional Firestore reads are required for this comparison.
6. **Keep failover OFF.** Even a 100% matching point-in-time copy is
   not live sync. Continuity of writes/deletions since the capture,
   durable private delivery, authentication/session locks, linked
   attachments, failure recovery and failback must be verified before
   a separate manual release authorization.

## Implementation and verification

- Clean Draft PR: #245, branch
  `feat/qa-core-safe-outbox-current-main-20261114`
- Inert, no-HTTP-route stage components:
  - `server/qaWindowsCandidateArchiveStage.js`
  - `server/qaWindowsReconciliationReview.js`
  - `server/qaLiveMirrorStage.js` (optional frozen state lock)
- Automated tests are **synthetic** and run in disposable PostgreSQL 17.
  They validate untouched baseline, a separate candidate, exact 11-dataset
  hash verification, modified/added/removed counts and fail-closed
  refusal when the frozen state changes.
- No candidate capture, rerun of Firestore reads, new Windows installation,
  backup overwrite, production deployment, GitHub merge or failover
  activation was performed in this coding step.

## Outstanding release barriers

- Make an operator-reviewed, credentials-private and quota-aware Windows
  runner to **perform** the new Firestore source capture and stage copy.
  The current module guards alone do not start a capture.
- Obtain the real Windows candidate snapshot receipt, compare to the old
  archive, and independently verify all dataset revisions.
- Establish continuous 11-collection source change capture, replay,
  durable acknowledgements and outage-gap reconciliation. Realtime
  listeners may consume additional untracked reconnect reads.
- Validate parity of source permissions, login revocations, session
  takeover, draft autosaves, case score writes, signed documents,
  appeals, linked attachments, and failback before any rollout.

**Operational status: `QA_FAILOVER=OFF`. No local command required now.**
