-- Additive QA-only standby tables for PostgreSQL 17 installed on Windows.
-- Run ONLY on a reviewed QA database in an explicit maintenance window.
-- Never run against Supabase or Firebase. No existing QA source table is altered.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa_failover_v1;
CREATE TABLE IF NOT EXISTS qa_failover_v1.evaluations (
  evaluation_id text PRIMARY KEY,
  record jsonb NOT NULL CHECK (jsonb_typeof(record)='object'),
  version bigint NOT NULL CHECK (version >= 1),
  origin text NOT NULL CHECK (origin IN ('firebase_snapshot','standby_write')),
  source_hash text CHECK (source_hash IS NULL OR source_hash ~ '^[a-f0-9]{64}$'),
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qa_failover_v1.outbox (
  operation_id text PRIMARY KEY,
  evaluation_id text NOT NULL REFERENCES qa_failover_v1.evaluations(evaluation_id),
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  actor_username text NOT NULL,
  base_version bigint NOT NULL CHECK (base_version >= 0),
  next_version bigint NOT NULL CHECK (next_version = base_version + 1),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  source_base_hash text,
  record jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_flight','synced','conflict')),
  claimed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  remote_revision text,
  error_code text
);
CREATE INDEX IF NOT EXISTS qa_outbox_queue_idx
  ON qa_failover_v1.outbox(status,created_at,operation_id);
CREATE INDEX IF NOT EXISTS qa_outbox_record_idx
  ON qa_failover_v1.outbox(evaluation_id,created_at);
CREATE TABLE IF NOT EXISTS qa_failover_v1.audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id text NOT NULL UNIQUE REFERENCES qa_failover_v1.outbox(operation_id),
  evaluation_id text NOT NULL,
  actor_username text NOT NULL,
  action text NOT NULL,
  next_version bigint NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qa_failover_v1.state (
  id smallint PRIMARY KEY CHECK (id=1),
  mode text NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled','standby','reconciling')),
  generation bigint NOT NULL DEFAULT 0,
  source_snapshot_verified boolean NOT NULL DEFAULT false,
  write_frozen boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO qa_failover_v1.state(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
COMMIT;
