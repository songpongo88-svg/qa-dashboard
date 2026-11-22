-- QA Core signed review sender queue: DISPOSABLE PostgreSQL 17 LAB ONLY.
-- Requires the existing private QA Core intent and review-only source candidate.
-- No source confirmation, delivery-ready state, real Windows receiver,
-- Firestore calls, scheduled job, public API or active snapshot changes.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_core_replication_stage.review_sender_lab_streams(
 stream_id text PRIMARY KEY CHECK(stream_id ~ '^[A-Za-z0-9_.:-]{12,128}$'),
 signer_spki_sha256 text NOT NULL CHECK(signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
 last_sequence bigint NOT NULL DEFAULT 0
   CHECK(last_sequence>=0 AND last_sequence<=1000000000000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qa_core_replication_stage.review_sender_lab_outbox(
 stream_id text NOT NULL REFERENCES
   qa_core_replication_stage.review_sender_lab_streams(stream_id) ON DELETE RESTRICT,
 sequence bigint NOT NULL CHECK(sequence>0 AND sequence<=1000000000000),
 operation_id text NOT NULL UNIQUE REFERENCES
   qa_core_replication_stage.source_verification_candidates(operation_id) ON DELETE RESTRICT,
 document_path text NOT NULL CHECK(length(document_path) BETWEEN 3 AND 950),
 observed_revision text NOT NULL CHECK(observed_revision ~
   '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'),
 envelope_json jsonb NOT NULL CHECK(jsonb_typeof(envelope_json)='object'),
 envelope_sha256 text NOT NULL CHECK(envelope_sha256 ~ '^[0-9a-f]{64}$'),
 signature_base64 text NOT NULL CHECK(length(signature_base64)=88),
 signer_spki_sha256 text NOT NULL CHECK(signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
 source_continuity_certified boolean NOT NULL DEFAULT false
  CHECK(source_continuity_certified=false),
 delivery_authorized boolean NOT NULL DEFAULT false
  CHECK(delivery_authorized=false),
 delivery_acknowledged boolean NOT NULL DEFAULT false
  CHECK(delivery_acknowledged=false),
 failover_eligible boolean NOT NULL DEFAULT false
  CHECK(failover_eligible=false),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(stream_id,sequence)
);
CREATE INDEX IF NOT EXISTS qa_review_sender_lab_path_idx
 ON qa_core_replication_stage.review_sender_lab_outbox(stream_id,document_path,sequence DESC);
ALTER TABLE qa_core_replication_stage.review_sender_lab_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_core_replication_stage.review_sender_lab_streams FORCE ROW LEVEL SECURITY;
ALTER TABLE qa_core_replication_stage.review_sender_lab_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_core_replication_stage.review_sender_lab_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qa_core_replication_stage.review_sender_lab_streams FROM PUBLIC;
REVOKE ALL ON qa_core_replication_stage.review_sender_lab_outbox FROM PUBLIC;
DO $guard$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON TABLE qa_core_replication_stage.review_sender_lab_streams FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON TABLE qa_core_replication_stage.review_sender_lab_outbox FROM %I',role_name);
  END IF;
 END LOOP;
END
$guard$;
COMMIT;
