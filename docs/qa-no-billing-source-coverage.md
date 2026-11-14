# QA Failover PR #210: no-Google-Billing continuation

## Verified current state (14 Nov 2026)

The operator confirmed Firestore project \`qa-dashboard-b0b5d\`, the default
Firestore database in \`asia-southeast1\`, Google Cloud CLI login and
\`billingEnabled:false\`. Both visible Google Billing accounts are closed.
The Windows machine has the existing frozen PostgreSQL 17 snapshot, daily
Firestore read ledger, empty delta journal and the dedicated receiver modules
installed. The \`qa_delta_ingester\` database role is **NOLOGIN** and the receiver
is **NOT_STARTED**. \`QA_FAILOVER=OFF\` remains mandatory.

**Do not reinstall PostgreSQL or Delta Journal. Do not enable Google billing.**
The Eventarc + Cloud Tasks route in this PR is staged but inactive. The
Firestore producer is not deployed, and is not usable as a no-billing source
of real-time updates.

## Direct Firestore writer evidence (repository-level)

\`scripts/check-qa-no-billing-source-writers.mjs\` inventories all 11 relevant
collection names and known frontend writer candidates:

- Evaluations: \`src/evaluationStore.ts\` (Firestore transactions).
- Appeals: \`src/appealStore.ts\` (setDoc + transactions).
- Signature documents and library: \`src/signatureStore.ts\`.
- User profiles, roles, permissions and settings: \`src/userRoleStore.ts\`.
- Sessions and session revocations: \`src/sessionStore.ts\`.
- Evaluation progress and evaluation edit locks:
  \`src/qaEvaluationProgressStore.ts\`, \`src/evaluationEditingStore.ts\`,
  \`src/evaluationStore.ts\`.

This is an **initial inventory**, not evidence of exhaustiveness. Scan the
rest of all frontend and server write call-sites, all Firestore collections,
Storage attachments, admin scripts, and remote clients before claiming
complete interception. A Vercel webhook cannot observe successful direct
browser Firestore writes from another client without a separate verified
source or changes to those write paths.

## Credible no-Google-Billing architecture (not yet implemented)

1. Keep the current Firestore-primary production system unchanged.
2. Build one **server-authorized QA mutation service** for the 11 QA
   collections, with source-of-truth leases, month/signature/appeal locks,
   session revocations and per-operation idempotency. All production QA
   clients must write through it; server validation cannot trust a browser
   "admin" role or a client-supplied success flag.
3. Persist a **durable change journal before acknowledging a client write**.
   A Vercel process memory buffer, browser localStorage, or best-effort
   "Firestore then HTTP mirror" request is not durable. Cross-database
   atomicity cannot be assumed. The chosen durable store (an isolated
   hosted queue/database or a documented availability-dependent
   Windows-only design) must be approved and tested separately.
4. Feed only the committed, authenticated journal to Windows through a
   private Cloudflare Tunnel/VPC endpoint. Protect the Windows receiver with
   a dedicated non-Google service identity and distinct keys; do not reuse
   Cloud Tasks OIDC logic as if it authenticated a Vercel sender.
5. Implement ack/retry, deduplication, exact revision ordering, tombstones,
   backlog/health alerts and independent reconciliation. Reconcile all
   pre-existing Firestore documents (including writes from clients that
   bypassed the new service) before treating any snapshot as current.
6. Run synthetic then real Windows outage/failback tests, verifying QA
   evaluation/appeal/signature CRUD, attachments, role revocations, monthly
   locks and conflict handling; **only then** propose cutover.

Until this migration and parity are certified, an incremental periodic
Firestore read can be used **only** as a bounded, quota-aware inspection.
It cannot guarantee zero loss during a Firestore quota outage, and a
low-read source scan alone cannot certify a complete standby.

## Release gate

No matter how many previous backups or standalone CI tests succeed,
\`QA_NO_BILLING_MIRROR_STATUS=BLOCKED\` until there is a trustworthy durable
source, verified full writer coverage, replay/failback certification and
server-approved parity. Keep PR Draft and do not merge/deploy as live failover.
Cloudflare Workers VPC may currently be free during its beta, but standard
Workers request/compute pricing and provider usage limits still apply.

The audit script performs **zero network requests and zero user-data reads**.
