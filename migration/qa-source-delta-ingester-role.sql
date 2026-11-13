-- QA source Delta Journal ONLY, independent from archive and score writers.
-- Create a NOLOGIN role until an operator explicitly sets a strong password
-- locally on Windows; no remote service is exposed by this migration.
-- Apply after the delta journal schema in an authorized maintenance window.
BEGIN;
DO $qa$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='qa_delta_ingester') THEN
   CREATE ROLE qa_delta_ingester NOLOGIN NOINHERIT;
 END IF;
END $qa$;
ALTER ROLE qa_delta_ingester NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE qa_dashboard_lab TO qa_delta_ingester;
GRANT USAGE ON SCHEMA qa_failover_v1 TO qa_delta_ingester;
GRANT SELECT ON qa_failover_v1.state,
  qa_failover_v1.live_snapshot_batches TO qa_delta_ingester;
GRANT SELECT,INSERT,UPDATE ON qa_failover_v1.source_delta_events,
  qa_failover_v1.source_delta_latest TO qa_delta_ingester;
REVOKE ALL ON qa_failover_v1.evaluations,qa_failover_v1.outbox,
  qa_failover_v1.audit,qa_failover_v1.live_candidate_evaluations,
  qa_failover_v1.inactive_domain_documents FROM qa_delta_ingester;
REVOKE UPDATE,DELETE,INSERT ON qa_failover_v1.state,
  qa_failover_v1.live_snapshot_batches FROM qa_delta_ingester;
COMMIT;
