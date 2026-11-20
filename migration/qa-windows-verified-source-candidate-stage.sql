-- Windows-only private STAGING: verified point-read documents awaiting reconciliation.
-- Never updates the frozen snapshot, source_delta_latest, source_delta_events,
-- scores, user sessions or active failover. Apply only after a local DB backup.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_windows_probe_v1.verified_source_candidates(
  event_id text PRIMARY KEY REFERENCES qa_windows_probe_v1.source_signals(event_id) ON DELETE RESTRICT,
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id) ON DELETE RESTRICT,
  collection_name text NOT NULL CHECK(collection_name IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_user_profiles','qa_role_permissions','qa_user_sessions',
    'qa_user_session_controls','qa_role_definitions','qa_system_settings',
    'qa_signature_library','qa_evaluation_progress')),
  document_id text NOT NULL CHECK(length(document_id) BETWEEN 1 AND 900
    AND position('/' IN document_id)=0 AND document_id !~ '[[:cntrl:]]'),
  observed_revision text NOT NULL CHECK(observed_revision ~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'),
  document_json jsonb NOT NULL CHECK(jsonb_typeof(document_json)='object'
    AND jsonb_typeof(document_json->'fields')='object'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  promotion_status text NOT NULL DEFAULT 'review_required'
    CHECK(promotion_status='review_required'),
  source_continuity_verified boolean NOT NULL DEFAULT false
    CHECK(source_continuity_verified=false),
  failover_eligible boolean NOT NULL DEFAULT false
    CHECK(failover_eligible=false),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_verified_source_candidates_review_idx
  ON qa_windows_probe_v1.verified_source_candidates(snapshot_id,recorded_at);
ALTER TABLE qa_windows_probe_v1.verified_source_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_windows_probe_v1.verified_source_candidates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qa_windows_probe_v1.verified_source_candidates FROM PUBLIC;
DO $guard$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON TABLE qa_windows_probe_v1.verified_source_candidates FROM %I',role_name);
  END IF;
 END LOOP;
END
$guard$;
COMMIT;
