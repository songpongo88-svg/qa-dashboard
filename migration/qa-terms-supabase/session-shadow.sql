-- Read-only staging for QA session and permission migration.
-- The existing Firebase sessions remain authoritative until a tested cutover.
-- Never import plaintext passwords, session tokens, or service-account credentials.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa_migration;
REVOKE ALL ON SCHEMA qa_migration FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS qa_migration.session_shadow (
  session_key_hmac text PRIMARY KEY CHECK (session_key_hmac ~ '^[0-9a-f]{64}$'),
  username text NOT NULL CHECK (length(btrim(username)) > 0),
  role text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked','expired')),
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  source_update_time text,
  source_sha256 text CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS session_shadow_user_expiry_idx
  ON qa_migration.session_shadow(username,expires_at);
CREATE TABLE IF NOT EXISTS qa_migration.session_revocation_shadow (
  username text PRIMARY KEY CHECK (length(btrim(username)) > 0),
  revoked_before timestamptz,
  source_update_time text,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qa_migration.identity_reconciliation (
  audit_id text NOT NULL,
  metric_key text NOT NULL,
  firebase_value text,
  supabase_value text,
  matched boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id,metric_key)
);
ALTER TABLE qa_migration.session_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_migration.session_revocation_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_migration.identity_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qa_migration.session_shadow, qa_migration.session_revocation_shadow,
  qa_migration.identity_reconciliation FROM PUBLIC,anon,authenticated;
COMMIT;
