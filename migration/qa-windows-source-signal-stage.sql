-- Staging only; Windows qa_dashboard_lab already contains qa_failover_v1.
-- No live QA writes, source commit claims or automatic failover.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa_windows_probe_v1;
REVOKE ALL ON SCHEMA qa_windows_probe_v1 FROM PUBLIC;
CREATE TABLE IF NOT EXISTS qa_windows_probe_v1.source_signals(
  event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 16 AND 180),
  snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id) ON DELETE RESTRICT,
  collection_name text NOT NULL CHECK(collection_name IN (
   'qa_evaluations','qa_appeal_events','qa_signature_documents',
   'qa_user_profiles','qa_role_permissions','qa_user_sessions',
   'qa_user_session_controls','qa_role_definitions','qa_system_settings',
   'qa_signature_library','qa_evaluation_progress')),
  document_id text NOT NULL CHECK(length(document_id) BETWEEN 1 AND 900
    AND position('/' IN document_id)=0 AND document_id !~ '[[:cntrl:]]'),
  change_type text NOT NULL CHECK(change_type IN ('added','modified','removed')),
  observed_revision text,
  source_commit_verified boolean NOT NULL DEFAULT false CHECK(source_commit_verified=false),
  needs_reconciliation boolean NOT NULL DEFAULT true CHECK(needs_reconciliation=true),
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK((change_type='removed' AND observed_revision IS NULL)
   OR (change_type IN ('added','modified') AND observed_revision ~
   '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'))
);
CREATE INDEX IF NOT EXISTS qa_windows_probe_signal_order_idx
  ON qa_windows_probe_v1.source_signals(snapshot_id,received_at);
REVOKE ALL ON qa_windows_probe_v1.source_signals FROM PUBLIC;
COMMIT;
