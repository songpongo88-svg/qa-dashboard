# Monthly Individual Coaching release

This release uses the existing application's username/password login, roles, and current team assignments. QA can select all active Admin Live Chat/Virtual Rider accounts. Senior matches the current account and exact assigned Senior identity; partial names, suspended users, unknown identities and stale roles are excluded. Other existing roles keep their previous Coaching screen and permissions.

## Data compatibility

The existing `qa_coaching_records` collection and historical document IDs are preserved. New optional fields are agentId, seniorId, seniorName, teamId, qaSummary, recommendedTopics, appointment, actualCoaching, actions, qaReviewComment and attachments. A deterministic username/month ID prevents duplicate new monthly records. Legacy records remain readable; editing reuses the selected historical ID. Historical team/Senior snapshots are retained. No migration deletes or rewrites old records.

Monthly writes use a Firestore transaction with an expected updatedAt value. Stale submissions fail visibly. Each role can update its own fields and permitted status transitions; the other role's fields and identity snapshots are retained. A failed remote read cannot silently substitute cached records in the new workspace. The existing store API for other screens remains compatible.

Unsaved forms use sessionStorage keys containing viewer username, subject username and month. Saving commits to Firestore. When another role has updated the record, only fields still editable by the current role are restored from local drafts. The selected Admin, month and detail tab are also retained.

Scores use the existing canonical Coaching/Dashboard source including approved appeals. The pass threshold is 85%. Attachments reuse the existing Google Drive upload endpoint (PDF, DOCX, XLSX, PNG, JPG; maximum 3 MB so base64 stays within the existing request limit). The upload route's configuration and storage sharing policy are unchanged.

## Access boundary

The application filters and write guards do not replace database authorization. Existing production Firestore catch-all rules and the client-side login were observed in the previous investigation. This release does not claim database-level team isolation and does not modify global Firestore rules or migrate login. A verified backend identity and a coordinated rules migration remain a separate security task for the whole application, as tightening the rules alone would break existing unsigned-in screens.

## Verification

`npm run test:monthly-coaching` mounts the actual React page with isolated in-memory service adapters and runs the real store transaction/validation code. It covers QA Draft and appointment, unsaved form unmount/remount, two Senior teams with overlapping names, read-only QA fields, multiple Action Plans, return with comment, acceptance, next-month follow-up, history, duplicate prevention, stale writes, and immutable team/identity snapshots. No production QA records are created by these tests. Full production build also runs the existing Draft Queue, deduction tags, rich text, guide, weather, theme and signature PDF regression suites.
