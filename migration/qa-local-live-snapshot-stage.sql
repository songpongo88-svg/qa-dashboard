-- Additive, QA-only staging for authoritative Firestore snapshot comparison.
-- Run against qa_dashboard_lab only, after a separate database backup.
-- This does not replace 2,081 archived QA documents, enable failover, or
-- change any case scores, appeals, signatures, profiles, or role permissions.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_failover_v1.live_snapshot_batches (
  snapshot_id text PRIMARY KEY CHECK (snapshot_id ~ '^[a-zA-Z0-9_.:-]{12,128}$'),
  source_export_id text NOT NULL,
  source_exported_at timestamptz NOT NULL,
  source_provenance text NOT NULL CHECK (source_provenance='verified-firestore-server-export'),
  status text NOT NULL DEFAULT 'staging'
    CHECK (status IN ('staging','copy_verified')),
  source_documents integer NOT NULL CHECK (source_documents>=0),
  stored_documents integer NOT NULL DEFAULT 0 CHECK (stored_documents>=0),
  dataset_manifest jsonb NOT NULL,
  verified_at timestamptz,
  approved_for_failover boolean NOT NULL DEFAULT false
    CHECK (approved_for_failover=false),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qa_failover_v1.live_snapshot_rows (
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id)
    ON DELETE RESTRICT,
  document_path text NOT NULL,
  root_collection text NOT NULL,
  document_json jsonb NOT NULL CHECK (jsonb_typeof(document_json)='object'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(snapshot_id,document_path)
);
CREATE INDEX IF NOT EXISTS qa_live_snapshot_collection_idx
  ON qa_failover_v1.live_snapshot_rows(snapshot_id,root_collection,document_path);
-- Normalized, immutable QA evaluation candidates. These cannot become
-- active standby records until a later independent cutover authorization.
CREATE TABLE IF NOT EXISTS qa_failover_v1.live_candidate_evaluations (
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id)
    ON DELETE RESTRICT,
  evaluation_id text NOT NULL,
  record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}
),
  original_score numeric NOT NULL CHECK(original_score BETWEEN 0 AND 100),
  deleted_at timestamptz,
  PRIMARY KEY(snapshot_id,evaluation_id)
);
CREATE INDEX IF NOT EXISTS qa_live_candidate_snapshot_score_idx
  ON qa_failover_v1.live_candidate_evaluations(snapshot_id,original_score);
CREATE TABLE IF NOT EXISTS qa_failover_v1.live_candidate_audit (
  snapshot_id text PRIMARY KEY REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id)
    ON DELETE RESTRICT,
  evaluation_count integer NOT NULL CHECK(evaluation_count>=0),
  verified_at timestamptz NOT NULL DEFAULT now(),
  eligible_for_failover boolean NOT NULL DEFAULT false
    CHECK(eligible_for_failover=false)
);
COMMIT;
