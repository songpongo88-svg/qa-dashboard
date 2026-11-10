# QA Dashboard PostgreSQL cutover — staged connection (2026-11-10)

**Status: NOT READY FOR PRODUCTION. No cutover enabled.** Scope: QA evaluation data, not QA Sparks.

## Verified from the user's local checks
- PostgreSQL database `qa_dashboard_lab` and loopback read-only API on `127.0.0.1:8787` connected successfully.
- The local QA backup contains 563 evaluation documents and 570 historical Excel rows, held separately.
- `qa_cutover_candidate.evaluation_snapshot` copied all 563 backed-up evaluations; local record/hash parity passed. This does NOT prove that Firebase has no later records.
- Synthetic `qa_cutover_stage` write/idempotency/version-conflict tests passed; these are NOT live QA write tests.
- Supabase-origin backup jobs remain `pending` with `validated_count=0` and cannot verify Firebase evaluation completeness.

## What this branch implements
`/api/qa-local-diagnostics` is a preview-only, secret-gated *server-to-server* connectivity probe. It returns only boolean database readiness or aggregate counts. It returns no QA case bodies, accepts no writes and remains disabled on Production even if the feature flag is set.

Preview-only Vercel environment variables (all values kept server-side):
- `QA_LOCAL_DIAGNOSTICS_ENABLED=1`
- `QA_LOCAL_DIAGNOSTIC_KEY` (operator secret, 32+ characters; only sent as `x-qa-diagnostic-key` request header, never query/browser code)
- `QA_LOCAL_BRIDGE_URL` (private HTTPS tunnel root, e.g. `https://qa-bridge.example.net/`, never a direct PostgreSQL address)
- `QA_LOCAL_BRIDGE_TOKEN` (existing local read-only API bearer token, 40+ characters)
- Optional `QA_CF_ACCESS_CLIENT_ID` and `QA_CF_ACCESS_CLIENT_SECRET` for Cloudflare Access service-to-service protection.

Allowed preview probes: `GET /api/qa-local-diagnostics?check=ready` and `?check=summary`. No QA rows are forwarded. A privately authenticated HTTPS tunnel and server access policy must exist first; a temporary Quick Tunnel is not a production endpoint. Keep local API bound to `127.0.0.1`, never expose port 5432.

## Remaining production blockers
1. Reconcile local QA backup against latest authoritative Firebase records by document identity and revision/content hash. Preserve missing/recent cases; do not treat 563 local records as complete live data.
2. Treat 570 historical Excel rows as separate historical source identities; preserve original scores and appeal history, do not collapse repeated Case IDs.
3. Implement authorized QA write API including authenticated sessions, revocations, roles, monthly result locks, edit permission, version conflict, replay protection, deletion tombstones and audit.
4. Set up durable private HTTPS ingress to Windows PC and monitor power/network availability; do not depend on a temporary tunnel.
5. Migrate all required read/write paths. `src/evaluationStore.ts` uses Firestore official transactions, while `src/sessionStore.ts` uses Firestore sessions. One query change is not a complete quota fix.
6. Test all protected workflows on preview, verify reports and scores, then perform an explicit, reversible cutover only after full parity. No automatic fallback to old Firebase balances or scores.

No changes to Firebase, the user's PC, QA scores, QA Sparks or production provider are performed by this branch.
