# Isolated QA Firestore Eventarc producer — opt-in, NOT DEPLOYED

This Cloud Run Functions source is separate from the Vercel QA Dashboard,
Cloudflare gateway, QA Sparks and Windows PostgreSQL.

Uses Google's Eventarc `google.cloud.firestore.document.v1.written` CloudEvent
**protobuf** payload. Preserves typed fields, including exact Firestore
integer, timestamp, array and map values. The function never queries Firestore
or scans any QA collections.

The `qaFirestoreDeltaProducer` handler rejects invocation unless
`QA_SOURCE_PRODUCER_ENABLED=1` and an authorized Cloud Run IAM + Eventarc
trigger is configured. Configure Google Secret Manager/env values:
`QA_SOURCE_FIRESTORE_PROJECT`, `QA_SOURCE_PINNED_SNAPSHOT`,
`QA_SOURCE_CLOUD_TASKS_QUEUE`, `QA_SOURCE_WORKER_URL`,
`QA_SOURCE_TASK_SA`, `QA_SOURCE_EVENT_HMAC_SECRET`.
Never expose these secrets to GitHub, ChatGPT, browser or Vercel.

Use dedicated least-privilege service accounts for the Eventarc trigger,
the Cloud Run producer and Cloud Tasks OIDC delivery. The Cloud Tasks target
must be the exact `https://<worker>/v1/qa/source-delta` endpoint and OIDC
audience; the Windows receiver independently validates the same service
account and audience against Google's public keys. Task creation is
idempotent per Firestore Eventarc source event ID and retries on unexpected
GCP errors. Configure queue task TTL **no longer than 7 days**, and monitor
dead letters, expiry, missed updates and delivery latency. Expiry, gaps or
replay conflicts require new source parity checks, not an automatic cutover.

The Eventarc filter should include only approved QA root documents or
filter at the producer; arbitrary collections are intentionally ignored.
`QA_FAILOVER=OFF` and Windows standby case writes stay disabled until
independent 11-dataset parity, auth, locks, CRUD and failback certification.

Google-managed cloud IAM/Eventarc/Cloud Tasks, Cloudflare VPC and Windows
role credentials are **NOT** provisioned by these files. Test against an
isolated Google project before any production event subscription.
