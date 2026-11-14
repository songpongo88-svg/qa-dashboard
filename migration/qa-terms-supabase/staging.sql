-- QA Dashboard T&C migration: private staging only.
-- Existing Firebase acceptance records remain authoritative until complete parity verification.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa_migration;
REVOKE ALL ON SCHEMA qa_migration FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS qa_migration.terms_acceptances (
  acceptance_id text PRIMARY KEY,
  username text NOT NULL,
  terms_version text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  source_update_time text,
  source_sha256 text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(username)) > 0 AND length(trim(terms_version)) > 0),
  CHECK (length(source_sha256) = 64)
);
CREATE INDEX IF NOT EXISTS terms_acceptances_by_user_version
  ON qa_migration.terms_acceptances (username, terms_version);
CREATE TABLE IF NOT EXISTS qa_migration.terms_reconciliation (
  audit_id text NOT NULL,
  metric_key text NOT NULL,
  firebase_value text,
  supabase_value text,
  matched boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, metric_key)
);
ALTER TABLE qa_migration.terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_migration.terms_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qa_migration.terms_acceptances, qa_migration.terms_reconciliation FROM PUBLIC, anon, authenticated;
COMMIT;
