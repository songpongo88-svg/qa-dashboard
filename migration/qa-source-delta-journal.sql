-- Local-only optional journal for future verified source-change events.
-- Does not edit source snapshots, evaluations, users, appeals or signatures.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_failover_v1.source_delta_events (
  event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 16 AND 180),
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id) ON DELETE RESTRICT,
  document_path text NOT NULL,
  root_collection text NOT NULL CHECK (root_collection IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_user_profiles','qa_role_permissions','qa_user_sessions',
    'qa_user_session_controls','qa_role_definitions','qa_system_settings',
    'qa_signature_library','qa_evaluation_progress')),
  operation text NOT NULL CHECK (operation IN ('upsert','delete')),
  source_changed_at timestamptz NOT NULL,
  document_json jsonb,
  content_hash text CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('applied','stale','conflict')),
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((operation='delete' AND document_json IS NULL AND content_hash IS NULL)
     OR (operation='upsert' AND jsonb_typeof(document_json)='object' AND content_hash IS NOT NULL)),
  CHECK (document_path LIKE root_collection || '/%')
);
CREATE INDEX IF NOT EXISTS qa_source_delta_time_idx ON
  qa_failover_v1.source_delta_events(snapshot_id,source_changed_at);
CREATE TABLE IF NOT EXISTS qa_failover_v1.source_delta_latest (
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id) ON DELETE RESTRICT,
  document_path text NOT NULL,
  root_collection text NOT NULL CHECK (root_collection IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_user_profiles','qa_role_permissions','qa_user_sessions',
    'qa_user_session_controls','qa_role_definitions','qa_system_settings',
    'qa_signature_library','qa_evaluation_progress')),
  event_id text NOT NULL REFERENCES qa_failover_v1.source_delta_events(event_id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('upsert','delete')),
  source_changed_at timestamptz NOT NULL,
  document_json jsonb,
  content_hash text CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(snapshot_id,document_path),
  CHECK ((operation='delete' AND document_json IS NULL AND content_hash IS NULL)
     OR (operation='upsert' AND jsonb_typeof(document_json)='object' AND content_hash IS NOT NULL)),
  CHECK (document_path LIKE root_collection || '/%')
);
REVOKE ALL ON qa_failover_v1.source_delta_events FROM PUBLIC;
REVOKE ALL ON qa_failover_v1.source_delta_latest FROM PUBLIC;
-- No public writer privileges. Trusted ingestion endpoint not implemented.
COMMIT;
