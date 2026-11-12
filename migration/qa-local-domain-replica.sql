-- QA-only exact, immutable copies of Appeals, Signatures and related authority.
-- Additive to the preexisting snapshot stage. It does NOT authorize writes.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_failover_v1.inactive_domain_documents (
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id) ON DELETE RESTRICT,
  document_path text NOT NULL,
  root_collection text NOT NULL CHECK (root_collection IN (
    'qa_appeal_events','qa_signature_documents','qa_signature_library',
    'qa_user_profiles','qa_role_permissions','qa_user_sessions',
    'qa_user_session_controls','qa_role_definitions','qa_system_settings',
    'qa_evaluation_progress')),
  original_json jsonb NOT NULL CHECK (jsonb_typeof(original_json)='object'),
  original_hash text NOT NULL CHECK (original_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(snapshot_id,document_path),
  CHECK (document_path LIKE root_collection || '/%')
);
CREATE INDEX IF NOT EXISTS qa_inactive_domain_collection_idx
  ON qa_failover_v1.inactive_domain_documents(snapshot_id,root_collection);
CREATE TABLE IF NOT EXISTS qa_failover_v1.inactive_domain_seed_audit (
  snapshot_id text PRIMARY KEY REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id) ON DELETE RESTRICT,
  seeded_documents integer NOT NULL CHECK(seeded_documents>=0),
  manifest_digest text NOT NULL CHECK(manifest_digest ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  approved_for_live_writes boolean NOT NULL DEFAULT false CHECK(approved_for_live_writes=false)
);
COMMIT;
