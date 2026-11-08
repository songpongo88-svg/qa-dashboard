-- QA Sparks private runtime migration (source-controlled reference).
-- Only for an empty, authorized Sparks staging schema; never live-cutover alone.
BEGIN;
CREATE SCHEMA IF NOT EXISTS sparks_runtime;
REVOKE ALL ON SCHEMA sparks_runtime FROM PUBLIC;
CREATE TABLE IF NOT EXISTS sparks_runtime.documents (
 source_path text PRIMARY KEY,
 fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(fields)='object'),
 create_time text NOT NULL,
 update_time text NOT NULL,
 copied_from_snapshot_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sparks_runtime.control (
 id text PRIMARY KEY,
 writes_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sparks_runtime.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sparks_runtime.control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sparks_runtime.documents, sparks_runtime.control FROM PUBLIC, anon, authenticated;
INSERT INTO sparks_runtime.control(id,writes_enabled) VALUES ('live_sparks',false)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
 SELECT source_path,payload,coalesce(nullif(source_create_time,''),'1970-01-01T00:00:00Z'),
  coalesce(nullif(source_update_time,''),'1970-01-01T00:00:00Z')
 FROM sparks_migration.documents ON CONFLICT(source_path) DO NOTHING;
CREATE OR REPLACE FUNCTION sparks_runtime.commit_writes(input_writes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE 
  v_write jsonb;
  v_relative text; v_name text; v_fields jsonb; v_mask jsonb;
  v_pre jsonb; v_key text; v_segments text[]; v_root text; v_time text;
  v_current sparks_runtime.documents%ROWTYPE;
  v_count integer:=0; v_seen text[]:=ARRAY[]::text[];
BEGIN
 PERFORM 1 FROM sparks_runtime.control WHERE id='live_sparks' AND writes_enabled=true FOR SHARE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'SPARKS_WRITES_DISABLED' USING ERRCODE='P0001';
 END IF;
 IF jsonb_typeof(input_writes)<>'array' OR jsonb_array_length(input_writes)>100 THEN
   RAISE EXCEPTION 'INVALID_SPARKS_WRITES' USING ERRCODE='22023';
 END IF;
 FOR v_write IN SELECT value FROM jsonb_array_elements(input_writes) LOOP
   IF NOT (v_write ? 'update') OR v_write ? 'delete' OR v_write ? 'transform' THEN
     RAISE EXCEPTION 'UNSUPPORTED_SPARKS_WRITE' USING ERRCODE='22023';
   END IF;
   v_name:=v_write #>> '{update,name}';
   IF v_name IS NULL OR left(v_name,58)<>'projects/qa-dashboard-b0b5d/databases/(default)/documents/' THEN
     RAISE EXCEPTION 'INVALID_SOURCE_DATABASE' USING ERRCODE='22023';
   END IF;
   v_relative:=substring(v_name from 59);
   v_segments:=string_to_array(v_relative,'/');
   v_root:=v_segments[1];
   IF v_root IN ('qa_typing_challenges','qa_typing_challenge_history') THEN
     RAISE EXCEPTION 'CROSS_DATABASE_QA_ACCESS_CHECK_BLOCKED' USING ERRCODE='22023';
   END IF;
   IF v_root NOT IN (
     'qa_sparks_wallets','qa_sparks_true_money_requests','qa_sparks_reward_settings',
     'qa_sparks_special_reward_requests','qa_sparks_special_receipt_evidence','qa_sparks_special_receipt_locks',
     'qa_sparks_fruit_players_v1','qa_sparks_fruit_boards','qa_sparks_fruit_rounds',
     'qa_sparks_lottery_draws_v1','qa_sparks_treasure_daily','qa_announcement_shield',
     'qa_sparks_snakes_rooms_v1','qa_sparks_snakes_members_v1',
     'qa_sparks_typing_relief_operations',
     'qa_typing_challenges','qa_typing_challenge_history'
   ) OR array_position(v_segments,'') IS NOT NULL OR
      NOT (array_length(v_segments,1)=2 OR
        (array_length(v_segments,1)=4 AND 
         ((v_root='qa_sparks_wallets' AND v_segments[3] IN ('history','lottery_tickets'))
           OR(v_root='qa_sparks_reward_settings' AND v_segments[3]='history')
           OR(v_root='qa_sparks_lottery_draws_v1' AND v_segments[3]='players'))
        ))
   THEN RAISE EXCEPTION 'INVALID_SPARKS_DOCUMENT_PATH' USING ERRCODE='22023'; END IF;
   IF v_relative=ANY(v_seen) THEN
      RAISE EXCEPTION 'DUPLICATE_WRITE_IN_COMMIT' USING ERRCODE='22023';
   END IF;
   v_seen:=array_append(v_seen,v_relative);
   v_fields:=v_write #> '{update,fields}';
   IF jsonb_typeof(v_fields)<>'object' THEN
     RAISE EXCEPTION 'INVALID_SPARKS_FIELDS' USING ERRCODE='22023';
   END IF;
   v_pre:=v_write->'currentDocument';
   SELECT * INTO v_current FROM sparks_runtime.documents WHERE source_path=v_relative FOR UPDATE;
   IF v_pre ? 'updateTime' THEN
      IF v_current.source_path IS NULL OR v_current.update_time IS DISTINCT FROM(v_pre->>'updateTime') THEN
         RAISE EXCEPTION 'ABORTED_PRECONDITION' USING ERRCODE='40001';
      END IF;
   ELSIF v_pre ? 'exists' THEN
      IF (v_pre->>'exists')::boolean<>(v_current.source_path IS NOT NULL) THEN
         RAISE EXCEPTION 'ABORTED_EXISTS_PRECONDITION' USING ERRCODE='40001';
      END IF;
   END IF;
   IF v_root = 'qa_sparks_wallets' AND array_length(v_segments,1)=2 AND v_current.source_path IS NOT NULL
       AND (v_pre IS NULL OR NOT (v_pre ? 'updateTime')) THEN
      RAISE EXCEPTION 'SPARKS_WALLET_CAS_REQUIRED' USING ERRCODE='22023';
   END IF;
   v_mask:=v_write #> '{updateMask,fieldPaths}';
   IF v_mask IS NOT NULL THEN
     IF jsonb_typeof(v_mask)<>'array' THEN
       RAISE EXCEPTION 'INVALID_UPDATE_MASK' USING ERRCODE='22023';
     END IF;
     v_fields:=coalesce(v_current.fields,'{}'::jsonb);
     FOR v_key IN SELECT value FROM jsonb_array_elements_text(v_mask) LOOP
        IF v_key !~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
          RAISE EXCEPTION 'UNSUPPORTED_FIELD_PATH' USING ERRCODE='22023';
        END IF;
        IF (v_write #> '{update,fields}') ? v_key THEN
          v_fields:=jsonb_set(v_fields,ARRAY[v_key],v_write #> ARRAY['update','fields',v_key],true);
        ELSE 
          v_fields:=v_fields-v_key;
        END IF;
     END LOOP;
   END IF;
   IF v_root = 'qa_sparks_wallets' AND array_length(v_segments,1)=2 AND v_fields ? 'balance'
       AND COALESCE(v_fields #>> '{balance,integerValue}','') !~ '^[0-9]{1,18}$' THEN
      RAISE EXCEPTION 'SPARKS_NEGATIVE_OR_INVALID_BALANCE' USING ERRCODE='22023';
   END IF;
   v_time:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
   IF v_current.source_path IS NULL THEN
     INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
      VALUES(v_relative,v_fields,v_time,v_time);
   ELSE
     UPDATE sparks_runtime.documents SET fields=v_fields,update_time=v_time WHERE source_path=v_relative;
   END IF;
   v_count:=v_count+1;
 END LOOP;
 RETURN jsonb_build_object('writeResults',jsonb_build_array(),'committedWrites',v_count);
END;
$function$;

REVOKE ALL ON FUNCTION sparks_runtime.commit_writes(jsonb) FROM PUBLIC,anon,authenticated;
-- Validate the complete optimistic read set, including records not changed by
-- this transaction (e.g. a lottery draw closing while a ticket is purchased).
CREATE OR REPLACE FUNCTION sparks_runtime.commit_transaction(input_writes jsonb,input_reads jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $function$
DECLARE r jsonb; p text; current_version text;
BEGIN
 IF jsonb_typeof(input_reads)<>'array' OR jsonb_array_length(input_reads)>500 THEN
   RAISE EXCEPTION 'INVALID_SPARKS_READS' USING ERRCODE='22023';
 END IF;
 FOR p IN SELECT DISTINCT q.path FROM (
   SELECT value->>'path' path FROM jsonb_array_elements(input_reads)
   UNION ALL
   SELECT substring(value #>> '{update,name}' from 59) path FROM jsonb_array_elements(input_writes)
 ) q WHERE q.path IS NOT NULL ORDER BY q.path LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(p,0));
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(input_reads) LOOP
   p:=r->>'path';
   SELECT update_time INTO current_version FROM sparks_runtime.documents WHERE source_path=p;
   IF current_version IS DISTINCT FROM (r->>'updateTime') THEN
     RAISE EXCEPTION 'ABORTED_READ_PRECONDITION' USING ERRCODE='40001';
   END IF;
 END LOOP;
 RETURN sparks_runtime.commit_writes(input_writes);
END;
$function$;
REVOKE ALL ON FUNCTION sparks_runtime.commit_transaction(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
