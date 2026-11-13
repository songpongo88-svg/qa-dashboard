# QA Dashboard — Single Active Session release gate

## Approved product policy
- One QA username, one active server session.
- New browser prompts before takeover; cancel leaves old browser active.
- After confirmation, old browser has at most 30 seconds to flush all unsaved edits.
- Evaluation text and topic scores are locally snapshotted every 5 seconds.
- In flagged mode, changed Evaluation text and topic scores are also saved through a verified server API every 5 seconds.
- Active user idle timeout is 30 minutes. Renewal happens on user activity only.
- Owner-only session list and forced Logout; atomic audit for session creation, replacement and revocation.
- If a draft is not saved durably, takeover is denied. Never claim recovery of unuploaded audio or evidence.

## Current implementation (branch only)
1. `server/qaFirebaseCredentials.js` verifies QA username/password against authoritative Firebase profile via the server-side Firebase Admin service account; password is not returned to the browser.
2. `server/qaSingleSessionAdmin.js` owns the QA session pointer, issues RSA-signed HttpOnly Strict cookies, uses Firestore preconditions for compare-and-swap, commits audit records with session transitions atomically, and enforces session ownership on its own server APIs.
3. `api/qa-single-session.js` supports login, conflict, request, pending, acknowledged draft flush, commit, validate, activity touch, logout, cloud draft read/write/delete and owner-only session management.
4. `src/App.tsx` wires an opt-in takeover prompt, old-browser flush notifications and session renewal. `src/CreateEvaluationMockup.tsx` writes changed text/score snapshots and refuses transfer if there are evidence/audio attachments needing their original browser.
5. `src/QaSessionAdminPanel.tsx` provides the owner session console; `src/lib/evaluation/sessionRecoveryStore.mjs` keeps browser-local recovery separate from the existing Draft Queue.

## Feature flags and safeguard
- `QA_SINGLE_SESSION_ENABLED=true` enables the server API. Default is OFF.
- `VITE_QA_SINGLE_SESSION_ENABLED=true` enables the browser integration. Default is OFF.
- Do NOT enable either flag until all gates below pass. Enabling just one must not become a silent legacy fallback.

## OPEN BLOCKERS — no Production rollout
- Existing Evaluation, Coaching, Appeal, profile/user and some QA Sparks read/write operations still use direct client-side Firestore or independent Supabase APIs. They do NOT all invoke the authoritative session guard, so a revoked browser could potentially keep writing. Every sensitive mutation must be migrated to authenticated server APIs or enforced equivalently with database rules that bind to the active session.
- QA Sparks has a standalone Supabase login that must be reconciled with the QA Dashboard session cookie before enforcing a unified one-session policy across both products.
- Current QA user accounts can authenticate via multiple legacy password paths and case-sensitive Firestore document IDs. The server verification bridge currently covers normalized QA profile IDs, not every legacy fallback. Must reconcile all active accounts and credential expiry semantics.
- Evaluation recovery covers text and topic scores; uploaded/unuploaded evidence and audio cannot yet be restored across devices. Current conservative policy denies transfer when attachments are present, but other editing workspaces need explicit dirty-state tracking and flush or handoff barriers.
- Add distributed anti-brute-force/rate limiting and monitor login failures without exposing password values.
- Verify trusted Firebase Admin configuration in Preview and perform two-browser live integration tests, offline/30-second timeout tests, audit atomicity tests, Admin revoke tests, QA Sparks duplicate-spend tests, 30-minute idle tests and rollback checks.
- Independently run full QA Dashboard Build, quota and coaching regressions before opening PR for merge. No successful end-to-end deployment has yet been verified.

## Deployment status
This is a **draft PR**, not a finished deployed feature. Never merge or expose the new feature flags while the blockers above remain. Do not apply the obsolete Supabase-only RPC prototype; it was removed in favor of the server-owned Firebase Admin adapter.
