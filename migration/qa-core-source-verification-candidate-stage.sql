-- QA CORE SOURCE COMMIT VERIFICATION CANDIDATES: ISOLATED STAGE ONLY.
-- This table does NOT authorize delivery and does not change the source outbox.
-- Apply only in the disposable qa_cutover_ci_test PostgreSQL 17 database.
-- No production migration or automatic application to Supabase.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_core_replication_stage.source_verification_candidates(
 operation_id text PRIMARY KEY REFERENCES qa_core_replication_stage.change_outbox(operation_id) ON DELETE RESTRICT,
 project_id text NOT NULL CHECK(project_id='qa-dashboard-b0b5d'),
 collection_name text NOT NULL CHECK (collection_name IN (
  'qa_evaluations','qa_appeal_events','qa_signature_documents',
  'qa_user_profiles','qa_role_permissions','qa_user_sessions',
  'qa_user_session_controls','qa_role_definitions','qa_system_settings',
  'qa_signature_library','qa_evaluation_progress')),
 document_path text NOT NULL CHECK(length(document_path) BETWEEN 3 AND 950),
 observed_revision text NOT NULL CHECK(observed_revision ~
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'),
 document_json jsonb NOT NULL CHECK(jsonb_typeof(document_json)='object'
  AND jsonb_typeof(document_json->'fields')='object'),
 field_hash text NOT NULL CHECK(field_hash ~ '^[0-9a-f]{64}$'),
 document_hash text NOT NULL CHECK(document_hash ~ '^[0-9a-f]{64}$'),
 review_status text NOT NULL DEFAULT 'review_required'
  CHECK(review_status='review_required'),
 source_continuity_certified boolean NOT NULL DEFAULT false
  CHECK(source_continuity_certified=false),
 delivery_eligible boolean NOT NULL DEFAULT false
  CHECK(delivery_eligible=false),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_core_source_verification_review_idx
 ON qa_core_replication_stage.source_verification_candidates(created_at);
ALTER TABLE qa_core_replication_stage.source_verification_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_core_replication_stage.source_verification_candidates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qa_core_replication_stage.source_verification_candidates FROM PUBLIC;
DO $guard$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON TABLE qa_core_replication_stage.source_verification_candidates FROM %I',role_name);
  END IF;
 END LOOP;
END
$guard$;
COMMIT;
