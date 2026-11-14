# QA Single Active Session — isolated Firebase rules canary

**Not production rules. Never deploy these files to `qa-dashboard-b0b5d` as-is.**

These two rulesets exercise an end-to-end, server-authoritative session pointer:

- Firestore: QA evaluation create/update reads `qa_single_session_active/{username}` and compares `qa_session_id`, role and numeric expiry against the Firebase custom-token claims.
- Storage: evidence uploads apply the *same* document-backed test through `firestore.get()` / `firestore.exists()`; old browser tokens cannot write after takeover.
- Both reject unauthenticated, forged UID, stale session ID, expired and changed-role writes, and deny direct client changes to the server's authoritative session documents.

The canary **deliberately denies other database collections and Storage paths**. Merging the active-session gate with the project's currently deployed rules requires first obtaining and reviewing the live Firestore and Storage rules, their anonymous password recovery requirements, pre-login profile reads and every QA collection and upload path. Replacing existing live rules with the canary would interrupt production work.

Local/test-only command (requires a working Node.js + Java environment):

```bash
npm ci
npm install --no-save --package-lock=false firebase-tools @firebase/rules-unit-testing
npx firebase --config security/qa-single-session/firebase.emulator.json emulators:exec \
  --project demo-qa-session --only firestore,storage \
  "node scripts/test-qa-single-session-firebase-rules.mjs"
```

The GitHub PR workflow also runs this command with a **demo project**; no Firebase plugin, OAuth key or live credentials are needed.

Before live rules activation:
1. Export the active rules; preserve a tested rollback.
2. Reconcile overlapping `allow` statements (a permissive match grants access even if another match denies).
3. Maintain pre-login password recovery and account discovery without exposing sensitive data.
4. Check Firestore / Storage session-document access cost and the Storage→Firestore service binding permission (cross-service rules reads can consume Firestore quota).
5. Test with two real browsers, expiry, file attachments, uploads and full QA Sparks activity; reconcile legacy account sessions; ensure no lost drafts.
6. Only then enable `QA_SINGLE_SESSION_ENABLED=true` and `VITE_QA_SINGLE_SESSION_ENABLED=true` together.

Deployment is intentionally **not** automatic from this folder.

## Supabase QA Core Data API boundary — staged, not applied

A live read-only permissions audit on 14 Nov 2026 found that several `public.qa_*`
tables, including evaluations, user profiles and role definitions, have permissive
`TO anon` policies and client Data API write grants. These tables are not yet a
secure Single Active Session mutation boundary even with RLS enabled. The
`sparks_runtime` schema is private and has no `anon`/`authenticated` usage
grants, but independent public owner RPCs still need review for stale JWT access.

`supabase-qa-core-client-lockdown.sql` is a **manual-only, approval-gated**
proposal to revoke direct client table access after every QA Core and failover
mutation has moved to a trusted session-aware API. It is NOT executed by Vercel,
CI or this PR. It intentionally excludes the read-only public Sparks status.

Before execution: inventory all client and fallback callers; back up original
grants and policies; test the real two-browser session handoff, server-backed
read/write routes, and full QA failover; confirm the release gate; run read-only
`has_table_privilege` audits after the transaction and test a rollback.
Do not turn on production session flags or merge PR #238 just because this
staging script exists.
