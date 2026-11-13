# Single Active Session rollout — security design and release gate

## Approved policy
- One active session per QA account across Dashboard and QA Sparks.
- A new login must detect an existing session and ask permission to take it over.
- A confirmed takeover waits up to 30 seconds for the old browser's draft flush before revoking it.
- Auto-save target: every 5 seconds after a change; server-backed draft plus local recovery.
- Idle timeout: 30 minutes.
- Administrator may view and revoke sessions.
- Server-side authorization, atomic replacement, and audit log required.

## Phase 1 implemented on this branch
- Set current session inactivity TTL to 30 minutes in sessionStore.
- Align UI session messages with 30 minutes.
- Decrease client-side revocation check from 15 to 1 minute and session renewal interval from 30 to 5 minutes.

## Not implemented / blockers for enabling the feature
1. Existing username login and Firestore session creation are client-side. A client-maintained session record is not a secure security boundary. Introduce a trusted backend (Vercel endpoint or a verified auth/DB service) to validate users and own session creation, atomic compare-and-swap takeovers and revocation.
2. All data mutations including QA evaluation, appeal, coaching and Sparks must verify active session on the trusted server. Otherwise old browsers may keep writing. Realtime can accelerate UX but must not be relied upon for authorization.
3. Build a 5-second auto-save adapter across all mutable forms, including versions/revision IDs and a local encrypted or appropriately protected recovery queue. Show save-acknowledged vs unsynced status.
4. Takeover protocol: request old browser draft flush; wait max 30 seconds; on success perform atomic takeover; if offline or draft flush fails, show explicit unsaved-risk acknowledgment before takeover. Never claim success when unsynced.
5. Implement administrator session management with explicit privilege checks and audit log (actor, target, action, device summary, timestamp).
6. Run two-browser tests, offline tests, pending evaluation draft / coaching / appeal tests, Sparks duplicate-award tests, expiry and recovery tests before production promotion.

## Operational caution
Do not merge or deploy this branch as a complete Single Active Session feature. The policy changes alone cannot enforce one active browser. 1-minute Firestore client polling can also increase read quota, so capacity and quota testing are required before rollout.
