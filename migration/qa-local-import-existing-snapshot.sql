-- QA-only Windows PostgreSQL 17 mirror import from the EXISTING local
-- qa_migration_lab.source_documents archive. Never queries Firestore or Sparks.
-- This transaction does NOT edit any original archive row or live QA score.
-- Rows must match EXACTLY on every retry; changed archive rows abort instead
-- of silently overwriting an old backup. This is NOT live Firebase parity.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('qa-standby-source-mirror-import',0));

DO $qa$
DECLARE
  c integer;
  n integer;
  conflict_count integer;
BEGIN
  IF current_database()<>'qa_dashboard_lab' THEN
    RAISE EXCEPTION 'Wrong database. Refusing standby mirror import';
  END IF;
  IF to_regclass('qa_migration_lab.source_documents') IS NULL
     OR to_regclass('qa_failover_v1.source_mirror') IS NULL THEN
    RAISE EXCEPTION 'Local archive or standby mirror schema missing';
  END IF;
  SELECT count(*)::integer INTO c
  FROM qa_migration_lab.source_documents s
  WHERE split_part(s.document_path,'/',1) IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_signature_library','qa_user_profiles','qa_role_definitions',
    'qa_role_permissions','qa_user_sessions','qa_user_session_controls',
    'qa_system_settings','qa_evaluation_progress'
  );
  IF c=0 THEN RAISE EXCEPTION 'No archived QA source documents found'; END IF;
  IF EXISTS (
    SELECT 1 FROM qa_migration_lab.source_documents s
    WHERE split_part(s.document_path,'/',1) IN (
      'qa_evaluations','qa_appeal_events','qa_signature_documents',
      'qa_signature_library','qa_user_profiles','qa_role_definitions',
      'qa_role_permissions','qa_user_sessions','qa_user_session_controls',
      'qa_system_settings','qa_evaluation_progress'
    )
    AND (
      s.original_json IS NULL OR jsonb_typeof(s.parsed_json) <> 'object'
      OR s.document_path !~ '^[^/]+/[^/]+$'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid archived document; no import applied';
  END IF;

  INSERT INTO qa_failover_v1.source_mirror
    (document_path,root_collection,original_json,parsed_json,original_hash,export_batch)
  SELECT s.document_path,split_part(s.document_path,'/',1),
         s.original_json,s.parsed_json,s.original_hash,s.export_batch
  FROM qa_migration_lab.source_documents s
  WHERE split_part(s.document_path,'/',1) IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_signature_library','qa_user_profiles','qa_role_definitions',
    'qa_role_permissions','qa_user_sessions','qa_user_session_controls',
    'qa_system_settings','qa_evaluation_progress'
  )
  ON CONFLICT(document_path) DO NOTHING;

  SELECT count(*)::integer INTO conflict_count
  FROM qa_migration_lab.source_documents s
  JOIN qa_failover_v1.source_mirror m ON m.document_path=s.document_path
  WHERE split_part(s.document_path,'/',1) IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_signature_library','qa_user_profiles','qa_role_definitions',
    'qa_role_permissions','qa_user_sessions','qa_user_session_controls',
    'qa_system_settings','qa_evaluation_progress'
  )
  AND (m.original_json IS DISTINCT FROM s.original_json
       OR m.parsed_json IS DISTINCT FROM s.parsed_json
       OR m.original_hash IS DISTINCT FROM s.original_hash);
  IF conflict_count>0 THEN
    RAISE EXCEPTION 'Source mirror differs for % archived documents; no changes committed',conflict_count;
  END IF;

  SELECT count(*)::integer INTO n
  FROM qa_failover_v1.source_mirror m
  WHERE m.root_collection IN (
    'qa_evaluations','qa_appeal_events','qa_signature_documents',
    'qa_signature_library','qa_user_profiles','qa_role_definitions',
    'qa_role_permissions','qa_user_sessions','qa_user_session_controls',
    'qa_system_settings','qa_evaluation_progress'
  );
  IF n<>c THEN
    RAISE EXCEPTION 'Source mirror count mismatch (% vs %)',n,c;
  END IF;
  INSERT INTO qa_failover_v1.mirror_import_audit
    (source_name,source_count,mirror_count,certified_live)
  VALUES('existing_archive',c,n,false);
END $qa$;

-- Report only non-sensitive collection counts; never output case payloads.
SELECT root_collection,count(*)::integer AS archived_documents
FROM qa_failover_v1.source_mirror
GROUP BY root_collection ORDER BY root_collection;

-- Failover stays disabled until a FRESH, complete, authenticated Firebase
-- capture, user/session mirror, private write API and parity pass.
DO $qa$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qa_failover_v1.state
  WHERE id=1 AND mode='disabled' AND write_frozen=true
    AND source_snapshot_verified=false) THEN
  RAISE EXCEPTION 'Standby state unexpectedly enabled. Import rolled back.';
 END IF;
END $qa$;
COMMIT;
