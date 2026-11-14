-- QA Core no-Google-Billing candidate ONLY. Does NOT replace Firestore
-- and must never be interpreted as an atomic dual-write guarantee.
-- Deploy is intentionally NOT wired to the shared Supabase production project.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa_core_replication_stage;
REVOKE ALL ON SCHEMA qa_core_replication_stage FROM PUBLIC;
CREATE TABLE IF NOT EXISTS qa_core_replication_stage.change_outbox (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation_id text NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 16 AND 180),
 collection_name text NOT NULL CHECK (collection_name IN (
  'qa_evaluations','qa_appeal_events','qa_signature_documents',
  'qa_user_profiles','qa_role_permissions','qa_user_sessions',
  'qa_user_session_controls','qa_role_definitions','qa_system_settings',
  'qa_signature_library','qa_evaluation_progress')),
 document_path text NOT NULL,
 operation text NOT NULL CHECK (operation IN ('upsert','delete')),
 document_json jsonb,
 payload_sha256 text,
 source_state text NOT NULL DEFAULT 'pending'
    CHECK (source_state IN ('pending','source_confirmed','needs_reconcile')),
 delivery_state text NOT NULL DEFAULT 'waiting'
    CHECK (delivery_state IN ('waiting','ready','leased','delivered','blocked')),
 attempted integer NOT NULL DEFAULT 0 CHECK (attempted BETWEEN 0 AND 100000),
 retry_after timestamptz NOT NULL DEFAULT now(),
 lease_owner text,lease_expires_at timestamptz,
 source_confirmed_at timestamptz,
 delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (document_path LIKE collection_name || '/%'
   AND strpos(substr(document_path,length(collection_name)+2),'/')=0
   AND length(document_path)<=950),
 CHECK ((operation='delete' AND document_json IS NULL AND payload_sha256 IS NULL)
     OR (operation='upsert' AND jsonb_typeof(document_json)='object'
       AND payload_sha256 ~ '^[0-9a-f]{64}$')),
 CHECK ((source_state='pending' AND delivery_state='waiting' AND source_confirmed_at IS NULL)
     OR (source_state='source_confirmed' AND source_confirmed_at IS NOT NULL
       AND delivery_state IN ('ready','leased','delivered','blocked'))
     OR (source_state='needs_reconcile' AND delivery_state='blocked')),
 CHECK ((delivery_state='leased' AND lease_owner IS NOT NULL
   AND lease_expires_at IS NOT NULL)
   OR (delivery_state<>'leased' AND lease_owner IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS qa_core_outbox_delivery_idx
 ON qa_core_replication_stage.change_outbox
 (retry_after,seq) WHERE source_state='source_confirmed'
 AND delivery_state IN ('ready','leased');
ALTER TABLE qa_core_replication_stage.change_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_core_replication_stage.change_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qa_core_replication_stage.change_outbox FROM PUBLIC;
DO $block$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA qa_core_replication_stage FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON TABLE qa_core_replication_stage.change_outbox FROM %I',role_name);
  END IF;
 END LOOP;
END $block$;
-- No network/webhook, public RPC, browser role, or automatic failover.
COMMIT;
