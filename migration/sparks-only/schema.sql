-- QA Sparks-only STAGING schema for hosted PostgreSQL.
-- Safe on a NEW, EMPTY DATABASE; no Firebase access, no production switch.
-- Executed manually using the owned Supabase SQL editor or equivalent only after access is connected.
BEGIN;

CREATE SCHEMA IF NOT EXISTS sparks_migration;
REVOKE ALL ON SCHEMA sparks_migration FROM PUBLIC;

CREATE TABLE IF NOT EXISTS sparks_migration.batches (
  batch_id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_project text NOT NULL DEFAULT 'qa-dashboard-b0b5d',
  source_database text NOT NULL DEFAULT '(default)',
  expected_documents bigint,
  imported_documents bigint NOT NULL DEFAULT 0 CHECK(imported_documents >= 0),
  notes text
);

CREATE TABLE IF NOT EXISTS sparks_migration.documents (
  source_path text PRIMARY KEY,
  collection_group text NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload) = 'object'),
  source_create_time text,
  source_update_time text,
  source_sha256 text,
  batch_id text REFERENCES sparks_migration.batches(batch_id),
  copied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sparks_source_path_nonempty CHECK(length(source_path) > 2)
);

CREATE INDEX IF NOT EXISTS sparks_migration_documents_group
  ON sparks_migration.documents(collection_group);
CREATE INDEX IF NOT EXISTS sparks_migration_documents_batch
  ON sparks_migration.documents(batch_id);

CREATE TABLE IF NOT EXISTS sparks_migration.reconciliation (
  run_id text NOT NULL,
  metric_key text NOT NULL,
  source_value text,
  destination_value text,
  matched boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, metric_key)
);

-- Intentionally grant no access to web users; staging data may contain phone
-- numbers, email addresses, receipt images and full wallet histories.
-- Connect using a backend-only privileged identity for the migration itself.
COMMIT;

-- Read-only checks to run after importing snapshot:
-- SELECT collection_group, count(*) AS document_count
-- FROM sparks_migration.documents GROUP BY collection_group ORDER BY collection_group;
-- SELECT count(*) FROM sparks_migration.reconciliation WHERE NOT matched;
