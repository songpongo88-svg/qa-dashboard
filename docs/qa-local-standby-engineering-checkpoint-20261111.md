# QA Dashboard local PostgreSQL standby — engineering checkpoint, 11 November 2026

## Current user-verified infrastructure
- Cloudflare Tunnel `robinhood-qa-backup`: healthy.
- Cloudflare VPC Service `qa-standby-loopback-8788` routed to `127.0.0.1:8788`.
- Private Worker `robinhood-qa-standby-bridge.songpongo88.workers.dev` configured with a server-side bearer hash.
- Vercel Preview QA backup status can reach the local read-only PostgreSQL bridge.
- Local archive reports **2,081 documents across 11 collections**, with matching archive import counts. This is **NOT** a verified copy of the latest Firestore.
- Existing local backup elsewhere reported **6,977 documents across 41 collections**. These are different scopes, not interchangeable proof.

## Implementation delivered on PR #210 (QA-only)
1. Existing HTTP bridge, Worker and Vercel Preview remain read-only and fail closed.
2. `server/qaFirestoreRestSnapshot.js` reads all six required Firestore datasets using one *fixed point-in-time readTime* from a trusted backend OAuth credential, paginates to completion and aborts on 403/429 or missing/duplicate documents.
3. `server/qaLiveMirrorStage.js` requires an authoritative, complete six-dataset manifest, checks every source identity and canonical SHA-256, then copies the source into separate PostgreSQL snapshot staging tables transactionally and independently checks stored contents.
4. `migration/qa-local-live-snapshot-stage.sql` is **additive**. It does not alter the existing 2,081 archived source documents, evaluations, outbox, appeal or signature records.
5. `scripts/Run-QA-Authoritative-Snapshot-Stage.mjs` is a guarded local-only runner that requires a validated existing `qa_dashboard_lab` connection, explicit stage-only opt-in and a private server-side OAuth token. It does not activate failover.
6. GitHub Actions runs both pure/fixture tests and disposable PostgreSQL 17 integration. No real production records or credentials are accessed during CI.

### Safety properties
- Never treat source count parity or a successful private tunnel as live Firestore parity.
- Snapshot import is atomic. Interrupted source pagination, quota exhaustion, invalid manifest, duplicates or PostgreSQL mismatch cannot mark an incomplete batch verified.
- Source documents are preserved in JSON and grouped by *document path*, not by non-unique case ID.
- No browser-supplied role or session flags can authorize writes; current QA login/session code still uses Firestore.
- `approved_for_failover=false` is a SQL invariant on new staged imports.
- Keep the original Firestore-primary behavior, QA Sparks, Production domain, historical scores and case records unchanged.

## Remaining critical work — NOT complete
1. Run the source capture from a trusted machine with Firestore server OAuth authority when the source permits a consistent, complete read. **No full source scan has been executed in this session.** The Vercel production service account is NOT replicated into untrusted Preview code.
2. Stage and verify the actual current source on the user's local PostgreSQL. The new migration has NOT been run on the user's Windows machine.
3. Establish continuous freshness/authority for all six datasets, including currently active/revoked sessions and role changes. A one-time export cannot support automatic failover indefinitely.
4. Connect QA login, role permissions, monthly locks, edit leases, appeal/signature operations and evaluation CRUD to independently verified local authority.
5. Enable a server-controlled fallback ONLY on trusted quota exhaustion and after all completeness, freshness and identity conditions are verified; keep durable outbox, replay conflict handling and independent failback parity.
6. Verify on real Windows PostgreSQL and real QA Preview with protected regression tests before Production changes.

## Deployment guidance
- The previously deployed read-only Vercel Preview remains the latest tested UI route. New snapshot modules are server-only and have not replaced it.
- PR #210 remains draft; do not merge or activate QA failover while the items above are unfinished.
- No repeated Cloudflare Tunnel/VPC setup, archive reimport, QA score re-entry or QA Sparks migration is required.
