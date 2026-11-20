-- QA Windows source-read reservation ledger: ADDITIVE and fail-closed.
-- Apply ONLY to qa_dashboard_lab with a database backup and admin approval.
-- No Firestore reads, evaluations, signatures, sessions or score changes.
-- Running the migration alone does NOT authorize Failover.
BEGIN;
CREATE TABLE IF NOT EXISTS qa_failover_v1.source_read_budget_daily (
  budget_day date NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^[a-z][a-z0-9-]{4,62}$'),
  reserved_document_units integer NOT NULL DEFAULT 0
    CHECK (reserved_document_units >= 0 AND reserved_document_units <= 20000),
  reserved_requests integer NOT NULL DEFAULT 0
    CHECK (reserved_requests >= 0 AND reserved_requests <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_day,project_id)
);
-- Non-public administrative counters. Never expose through a QA browser.
REVOKE ALL ON qa_failover_v1.source_read_budget_daily FROM PUBLIC;
DO $qa$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='qa_snapshot_importer') THEN
    EXECUTE 'GRANT SELECT,INSERT,UPDATE ON qa_failover_v1.source_read_budget_daily TO qa_snapshot_importer';
  END IF;
END
$qa$;
COMMIT;
