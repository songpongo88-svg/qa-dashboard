-- QA WINDOWS 17: INACTIVE private signed intake schema, not a listener.
-- Operator-controlled installation only after isolated pg_dump and
-- frozen snapshot preflight. This never mutates qa_failover_v1 snapshots,
-- QA scores, account roles, source event journals or standby settings.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa_windows_signed_receiver_v1;
REVOKE ALL ON SCHEMA qa_windows_signed_receiver_v1 FROM PUBLIC;
CREATE TABLE IF NOT EXISTS qa_windows_signed_receiver_v1.stream_cursor (
  stream_id text PRIMARY KEY
    CHECK (stream_id ~ '^[A-Za-z0-9_.:-]{12,128}$'),
  signer_spki_sha256 text NOT NULL
    CHECK (signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
  last_sequence bigint NOT NULL DEFAULT 0
    CHECK (last_sequence >= 0 AND last_sequence <= 1000000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qa_windows_signed_receiver_v1.inbox (
  stream_id text NOT NULL REFERENCES
    qa_windows_signed_receiver_v1.stream_cursor(stream_id) ON DELETE RESTRICT,
  sequence bigint NOT NULL
    CHECK (sequence > 0 AND sequence <= 1000000000000),
  operation_id text NOT NULL UNIQUE
    CHECK (length(operation_id) BETWEEN 16 AND 180),
  collection_name text NOT NULL CHECK (collection_name IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_user_profiles','qa_role_permissions','qa_user_sessions',
    'qa_user_session_controls','qa_role_definitions','qa_system_settings',
    'qa_signature_library','qa_evaluation_progress')),
  document_path text NOT NULL CHECK (length(document_path) BETWEEN 3 AND 950),
  operation text NOT NULL CHECK (operation='upsert'),
  observed_revision text NOT NULL CHECK (observed_revision ~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'),
  document_json jsonb NOT NULL CHECK (
    jsonb_typeof(document_json)='object' AND
    jsonb_typeof(document_json->'fields')='object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  envelope_sha256 text NOT NULL CHECK (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  signer_spki_sha256 text NOT NULL CHECK (signer_spki_sha256 ~ '^[0-9a-f]{64}$'),
  review_status text NOT NULL DEFAULT 'review_required'
    CHECK (review_status='review_required'),
  source_continuity_verified boolean NOT NULL DEFAULT false
    CHECK (source_continuity_verified=false),
  delivery_eligible boolean NOT NULL DEFAULT false
    CHECK (delivery_eligible=false),
  failover_eligible boolean NOT NULL DEFAULT false
    CHECK (failover_eligible=false),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(stream_id,sequence),
  CHECK (
    left(document_path,length(collection_name)+1) = collection_name || '/'
    AND length(document_path) > length(collection_name)+1
    AND position('/' IN substring(
      document_path FROM length(collection_name)+2))=0)
);
CREATE INDEX IF NOT EXISTS qa_windows_signed_receiver_v1_path_seq_idx
  ON qa_windows_signed_receiver_v1.inbox
  (stream_id, document_path, sequence DESC);
ALTER TABLE qa_windows_signed_receiver_v1.stream_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_windows_signed_receiver_v1.stream_cursor FORCE ROW LEVEL SECURITY;
ALTER TABLE qa_windows_signed_receiver_v1.inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_windows_signed_receiver_v1.inbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qa_windows_signed_receiver_v1.stream_cursor FROM PUBLIC;
REVOKE ALL ON qa_windows_signed_receiver_v1.inbox FROM PUBLIC;
DO $lockdown$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON SCHEMA qa_windows_signed_receiver_v1 FROM %I',
        role_name);
      EXECUTE format(
        'REVOKE ALL ON TABLE qa_windows_signed_receiver_v1.stream_cursor FROM %I',
        role_name);
      EXECUTE format(
        'REVOKE ALL ON TABLE qa_windows_signed_receiver_v1.inbox FROM %I',
        role_name);
    END IF;
  END LOOP;
END
$lockdown$;
-- Deliberately no privileges to a login role, no insert RPC, no service,
-- no trigger, no scheduler and no promotion from this inbox to live data.
COMMIT;
