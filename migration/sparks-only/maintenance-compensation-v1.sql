-- QA Sparks Maintenance Compensation v1: guarded future outages only.
-- Never retroactively compensate incidents predating installation.
BEGIN;
CREATE SCHEMA IF NOT EXISTS sparks_runtime;
CREATE TABLE IF NOT EXISTS sparks_runtime.maintenance_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source text NOT NULL CHECK(source IN ('dashboard','sparks')),
 incident_key text NOT NULL,
 start_at timestamptz NOT NULL,
 planned_end_at timestamptz,
 actual_end_at timestamptz,
 auto_close boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','closed','settled','review')),
 created_by text NOT NULL DEFAULT 'system',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 last_error text,
 CONSTRAINT maintenance_window_order CHECK(actual_end_at IS NULL OR actual_end_at>=start_at),
 CONSTRAINT maintenance_plan_order CHECK(planned_end_at IS NULL OR planned_end_at>start_at),
 UNIQUE(source,incident_key)
);
CREATE TABLE IF NOT EXISTS sparks_runtime.maintenance_eligible (
 incident_id uuid NOT NULL REFERENCES sparks_runtime.maintenance_incidents(id),
 username text NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(incident_id,username)
);
CREATE TABLE IF NOT EXISTS sparks_runtime.maintenance_awards (
 incident_id uuid NOT NULL REFERENCES sparks_runtime.maintenance_incidents(id),
 username text NOT NULL,
 activity text NOT NULL CHECK(activity IN ('daily-checkin','fruit-match','mining','hidden-treasure')),
 local_day date NOT NULL,
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 1500),
 history_path text NOT NULL,
 awarded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(incident_id,username,activity,local_day),
 UNIQUE(username,activity,local_day),
 UNIQUE(history_path)
);
CREATE INDEX IF NOT EXISTS sparks_maintenance_incidents_due_idx ON sparks_runtime.maintenance_incidents(state,start_at,actual_end_at);
ALTER TABLE sparks_runtime.maintenance_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sparks_runtime.maintenance_eligible ENABLE ROW LEVEL SECURITY;
ALTER TABLE sparks_runtime.maintenance_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sparks_runtime.maintenance_incidents,sparks_runtime.maintenance_eligible,
 sparks_runtime.maintenance_awards FROM PUBLIC,anon,authenticated;
-- Helpers are private, not in the Data API.
CREATE OR REPLACE FUNCTION sparks_runtime.maintenance_amount(v_activity text,v_day date)
RETURNS integer LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE p integer;
BEGIN
 IF v_activity='daily-checkin' THEN
   RETURN CASE WHEN v_day=DATE '2026-11-24' THEN 200 ELSE 50 END;
 ELSIF v_activity='fruit-match' THEN RETURN 20;
 ELSIF v_activity='mining' THEN
   p:=floor(random()*10000)::integer;
   IF p<6000 THEN RETURN floor(random()*100)::integer+1; END IF;
   IF p<8500 THEN RETURN floor(random()*200)::integer+101; END IF;
   IF p<9500 THEN RETURN floor(random()*450)::integer+301; END IF;
   IF p<9900 THEN RETURN floor(random()*450)::integer+751; END IF;
   RETURN floor(random()*300)::integer+1201;
 ELSIF v_activity='hidden-treasure' THEN
   p:=floor(random()*1000)::integer;
   IF p<700 THEN RETURN floor(random()*100)::integer+1; END IF;
   IF p<930 THEN RETURN floor(random()*200)::integer+101; END IF;
   RETURN floor(random()*200)::integer+301;
 END IF;
 RETURN 0;
END;
$$;
CREATE OR REPLACE FUNCTION sparks_runtime.maintenance_pay(
 p_incident uuid,p_username text,p_activity text,p_day date,p_amount integer
) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 wallet_path text:='qa_sparks_wallets/'||p_username;
 history_path text:=wallet_path||'/history/maintenance-'||p_activity||'-'||to_char(p_day,'YYYYMMDD');
 other_history text;
 w sparks_runtime.documents%ROWTYPE;
 f jsonb; updated jsonb; history jsonb;
 date_str text:=to_char(p_day,'YYYY-MM-DD');
 date_key text:=to_char(p_day,'YYYYMMDD');
 stamp text:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 year_now integer:=extract(year from clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::integer;
 num integer; earned integer; lifetime integer; balance integer; previous_year integer; annual_year integer;
 target_field text; claimed jsonb; val jsonb;
BEGIN
 IF p_amount<=0 OR p_amount>1500 OR p_username !~ '^[a-z0-9._-]{1,64}$' THEN RETURN 0; END IF;
 -- Same lock key as sparks_runtime.commit_transaction, protecting concurrent
 -- game redemptions that update the wallet in the same database.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(wallet_path,0));
 IF EXISTS(SELECT 1 FROM sparks_runtime.maintenance_awards
           WHERE username=p_username AND activity=p_activity AND local_day=p_day) THEN RETURN 0; END IF;
 SELECT * INTO w FROM sparks_runtime.documents WHERE source_path=wallet_path FOR UPDATE;
 f:=coalesce(w.fields,'{}'::jsonb);
 IF EXISTS(SELECT 1 FROM sparks_runtime.documents WHERE source_path=history_path) THEN RETURN 0; END IF;
 IF p_activity='daily-checkin' THEN
   IF p_day<DATE '2026-11-09' OR p_day>DATE '2026-11-30' THEN RETURN 0; END IF;
   other_history:=wallet_path||'/history/quest-daily-checkin-'||date_key;
   IF EXISTS(SELECT 1 FROM sparks_runtime.documents WHERE source_path=other_history) THEN RETURN 0; END IF;
   target_field:=CASE WHEN p_day<=DATE '2026-11-22' THEN 'dailyCheckin202611Days' ELSE 'dailyCheckin202611Phase2Days' END;
   claimed:=coalesce(f #> ARRAY[target_field,'arrayValue','values'],'[]'::jsonb);
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(claimed) q WHERE q->>'integerValue'=extract(day from p_day)::integer::text) THEN RETURN 0; END IF;
 ELSIF p_activity='mining' THEN
   other_history:=wallet_path||'/history/mining-'||date_str;
   IF EXISTS(SELECT 1 FROM sparks_runtime.documents WHERE source_path=other_history) OR f #>> '{miningLastDay,stringValue}'=date_str THEN RETURN 0; END IF;
 ELSIF p_activity='hidden-treasure' THEN
   other_history:=wallet_path||'/history/hidden-treasure-'||date_str;
   IF EXISTS(SELECT 1 FROM sparks_runtime.documents WHERE source_path=other_history) OR f #>> '{hiddenTreasureLastDay,stringValue}'=date_str THEN RETURN 0; END IF;
 ELSIF p_activity='fruit-match' THEN
   IF p_day<DATE '2026-11-09' OR p_amount>40 OR p_amount%20<>0 THEN RETURN 0; END IF;
 ELSE RETURN 0; END IF;

 previous_year:=coalesce((f #>> '{balanceYear,integerValue}')::integer,year_now);
 annual_year:=coalesce((f #>> '{memberYear,integerValue}')::integer,year_now);
 num:=CASE WHEN previous_year=year_now THEN coalesce((f #>> '{balance,integerValue}')::integer,0) ELSE 0 END;
 earned:=CASE WHEN annual_year=year_now THEN coalesce((f #>> '{memberYearEarned,integerValue}')::integer,0) ELSE 0 END;
 lifetime:=greatest(coalesce((f #>> '{totalEarned,integerValue}')::integer,0),
    coalesce((f #>> '{firstLogin,mapValue,fields,amount,integerValue}')::integer,0));
 IF num>2147483647-p_amount OR earned>2147483647-p_amount OR lifetime>2147483647-p_amount THEN
   RAISE EXCEPTION 'SPARKS_COMPENSATION_BALANCE_OVERFLOW';
 END IF;
 balance:=num+p_amount;
 updated:=f||jsonb_build_object(
  'username',jsonb_build_object('stringValue',p_username),
  'balance',jsonb_build_object('integerValue',balance::text),
  'balanceYear',jsonb_build_object('integerValue',year_now::text),
  'memberYear',jsonb_build_object('integerValue',year_now::text),
  'memberYearEarned',jsonb_build_object('integerValue',(earned+p_amount)::text),
  'totalEarned',jsonb_build_object('integerValue',(lifetime+p_amount)::text),
  'updatedAt',jsonb_build_object('stringValue',stamp));
 IF p_activity='daily-checkin' THEN
   updated:=jsonb_set(updated,ARRAY[target_field],
     jsonb_build_object('arrayValue',jsonb_build_object('values',claimed||
        jsonb_build_array(jsonb_build_object('integerValue',extract(day from p_day)::integer::text)))),true);
 ELSIF p_activity='mining' THEN
   updated:=updated||jsonb_build_object('miningLastDay',jsonb_build_object('stringValue',date_str),
       'miningLastAmount',jsonb_build_object('integerValue',p_amount::text));
 ELSIF p_activity='hidden-treasure' THEN
   updated:=updated||jsonb_build_object('hiddenTreasureLastDay',jsonb_build_object('stringValue',date_str));
 END IF;
 IF w.source_path IS NULL THEN
   INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
   VALUES(wallet_path,updated,stamp,stamp);
 ELSE
   UPDATE sparks_runtime.documents SET fields=updated,update_time=stamp WHERE source_path=wallet_path;
 END IF;
 history:=jsonb_build_object(
  'createdAt',jsonb_build_object('stringValue',stamp),
  'type',jsonb_build_object('stringValue','earn'),
  'source',jsonb_build_object('stringValue','qa-sparks-maintenance-compensation'),
  'title',jsonb_build_object('stringValue','Maintenance Compensation'),
  'detail',jsonb_build_object('stringValue',
    'ชดเชย Maintenance · '||p_activity||' · '||date_str||
      CASE WHEN p_day=DATE '2026-11-24' AND p_activity='daily-checkin' THEN ' · Loy Krathong 200 Sparks' ELSE '' END),
  'amount',jsonb_build_object('integerValue',p_amount::text),
  'balanceAfter',jsonb_build_object('integerValue',balance::text),
  'incidentId',jsonb_build_object('stringValue',p_incident::text),
  'activity',jsonb_build_object('stringValue',p_activity),
  'day',jsonb_build_object('stringValue',date_str),
  'performedBy',jsonb_build_object('stringValue','system'),
  'status',jsonb_build_object('stringValue','Completed'));
 INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
 VALUES(history_path,history,stamp,stamp);
 INSERT INTO sparks_runtime.maintenance_awards(incident_id,username,activity,local_day,amount,history_path)
 VALUES(p_incident,p_username,p_activity,p_day,p_amount,history_path);
 RETURN p_amount;
END;
$$;
CREATE OR REPLACE FUNCTION sparks_runtime.maintenance_process()
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 item sparks_runtime.maintenance_incidents%ROWTYPE;
 member record;
 d date;
 day_end timestamptz;
 mining_begin timestamptz;
 mining_end timestamptz;
 activities integer:=0;
 payout integer:=0;
 total integer:=0;
 n integer:=0;
 pdoc jsonb; plays integer; successes integer;
 range_end timestamptz;
 gate_open boolean;
BEGIN
 SELECT enabled INTO gate_open FROM public.qa_sparks_access_control WHERE id='global';
 -- Respect the same hard write switch used by the Supabase runtime bridge.
 IF NOT EXISTS(SELECT 1 FROM sparks_runtime.control WHERE id='live_sparks' AND writes_enabled=true) THEN
    RETURN jsonb_build_object('status','writes-disabled','awards',0);
 END IF;
 -- Capture every Active member seen while the outage is underway.
 FOR item IN SELECT * FROM sparks_runtime.maintenance_incidents WHERE state='scheduled' AND start_at<=now() LOOP
   INSERT INTO sparks_runtime.maintenance_eligible(incident_id,username)
    SELECT item.id,lower(trim(username)) FROM public.qa_user_profiles
    WHERE lower(status)='active' AND username ~* '^[a-z0-9._-]{1,64}$'
    ON CONFLICT DO NOTHING;
 END LOOP;
 -- Do not award while QA Sparks itself is still closed.
 IF gate_open IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','sparks-closed','awards',0); END IF;
 FOR item IN SELECT * FROM sparks_runtime.maintenance_incidents WHERE state='scheduled'
   AND start_at<=now() AND
    (actual_end_at IS NOT NULL OR (auto_close AND planned_end_at<=now()))
   ORDER BY start_at FOR UPDATE SKIP LOCKED LOOP
   range_end:=coalesce(item.actual_end_at,item.planned_end_at);
   IF range_end<=item.start_at OR range_end-item.start_at > interval '31 days' THEN
     UPDATE sparks_runtime.maintenance_incidents SET state='review',
       last_error='Invalid or longer-than-31-days interval' WHERE id=item.id;
     CONTINUE;
   END IF;
   -- Snapshot members on the closure boundary as well as during the outage.
   INSERT INTO sparks_runtime.maintenance_eligible(incident_id,username)
    SELECT item.id,lower(trim(username)) FROM public.qa_user_profiles
    WHERE lower(status)='active' AND username ~* '^[a-z0-9._-]{1,64}$'
    ON CONFLICT DO NOTHING;
   FOR d IN SELECT generate_series((item.start_at AT TIME ZONE 'Asia/Bangkok')::date,
        (range_end AT TIME ZONE 'Asia/Bangkok')::date,'1 day'::interval)::date LOOP
     day_end:=(d+1)::timestamp AT TIME ZONE 'Asia/Bangkok';
     mining_begin:=(d::timestamp + interval '14 hours') AT TIME ZONE 'Asia/Bangkok';
     mining_end:=(d::timestamp + interval '16 hours') AT TIME ZONE 'Asia/Bangkok';
     FOR member IN SELECT username FROM sparks_runtime.maintenance_eligible
       WHERE incident_id=item.id ORDER BY username LOOP
       -- A daily activity is lost if it expires during a still-closed outage.
       IF item.start_at<day_end AND range_end>=day_end THEN
         IF d BETWEEN DATE '2026-11-09' AND DATE '2026-11-30' THEN
           total:=total+sparks_runtime.maintenance_pay(item.id,member.username,'daily-checkin',d,
              sparks_runtime.maintenance_amount('daily-checkin',d));
         END IF;
         IF d>=DATE '2026-11-09' THEN
           SELECT fields INTO pdoc FROM sparks_runtime.documents
             WHERE source_path='qa_sparks_fruit_players_v1/'||member.username;
           plays:=CASE WHEN pdoc #>> '{playDay,stringValue}'=to_char(d,'YYYY-MM-DD')
                   THEN coalesce((pdoc #>> '{dailyPlayCount,integerValue}')::integer,0) ELSE 0 END;
           SELECT count(*) INTO successes FROM sparks_runtime.documents
           WHERE source_path LIKE 'qa_sparks_wallets/'||member.username||'/history/fruit-match-%'
             AND (fields #>> '{source,stringValue}')='mini-game-fruit-match'
             AND ((fields #>> '{createdAt,stringValue}')::timestamptz
                 AT TIME ZONE 'Asia/Bangkok')::date=d;
           -- Never compensate used attempts or already-paid winning rounds.
           total:=total+sparks_runtime.maintenance_pay(item.id,member.username,'fruit-match',d,
              20*greatest(0,2-greatest(plays,successes)));
           total:=total+sparks_runtime.maintenance_pay(item.id,member.username,'hidden-treasure',d,
              sparks_runtime.maintenance_amount('hidden-treasure',d));
         END IF;
       END IF;
       IF d>=DATE '2026-11-09' AND item.start_at<mining_end
         AND range_end>=mining_end AND range_end>mining_begin THEN
         total:=total+sparks_runtime.maintenance_pay(item.id,member.username,'mining',d,
           sparks_runtime.maintenance_amount('mining',d));
       END IF;
     END LOOP;
   END LOOP;
   UPDATE sparks_runtime.maintenance_incidents SET state='settled',
     actual_end_at=range_end, settled_at=now(),updated_at=now()
    WHERE id=item.id;
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('status','ok','incidents',n,'sparks',total);
END;
$$;
REVOKE ALL ON FUNCTION sparks_runtime.maintenance_process() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION sparks_runtime.maintenance_pay(uuid,text,text,date,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION sparks_runtime.maintenance_amount(text,date) FROM PUBLIC,anon,authenticated;
-- Access gate transitions are authoritative for a separate Sparks-only outage.
CREATE OR REPLACE FUNCTION sparks_runtime.maintenance_access_hook()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.enabled IS DISTINCT FROM NEW.enabled AND OLD.enabled=true AND NEW.enabled=false THEN
  INSERT INTO sparks_runtime.maintenance_incidents(source,incident_key,start_at,created_by)
    VALUES('sparks','sparks-access-'||to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYYMMDDHH24MISSUS'),
      clock_timestamp(),coalesce(NEW.updated_by,'system'));
 ELSIF OLD.enabled IS DISTINCT FROM NEW.enabled AND OLD.enabled=false AND NEW.enabled=true THEN
  UPDATE sparks_runtime.maintenance_incidents SET actual_end_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE id=(SELECT id FROM sparks_runtime.maintenance_incidents
      WHERE source='sparks' AND state='scheduled' AND actual_end_at IS NULL ORDER BY start_at DESC LIMIT 1);
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS qa_sparks_maintenance_compensation_access ON public.qa_sparks_access_control;
CREATE TRIGGER qa_sparks_maintenance_compensation_access
 AFTER UPDATE OF enabled ON public.qa_sparks_access_control
 FOR EACH ROW EXECUTE FUNCTION sparks_runtime.maintenance_access_hook();
REVOKE ALL ON FUNCTION sparks_runtime.maintenance_access_hook() FROM PUBLIC,anon,authenticated;
-- Owner-facing RPC: dates only, no caller-supplied amounts or recipient lists.
CREATE OR REPLACE FUNCTION public.qa_sparks_maintenance_compensation_v1(
 p_action text, p_key text DEFAULT NULL,p_start_at timestamptz DEFAULT NULL,
 p_planned_end_at timestamptz DEFAULT NULL,p_auto_close boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text; role_name text; row_data sparks_runtime.maintenance_incidents%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Verified owner session required' USING ERRCODE='42501'; END IF;
 SELECT lower(trim(username)),role INTO actor,role_name FROM public.sparks_verified_identity_v1() LIMIT 1;
 IF actor IS DISTINCT FROM 'songpon' OR role_name IS DISTINCT FROM 'Quality Assurance' THEN
   RAISE EXCEPTION 'Owner only' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  RETURN (SELECT coalesce(jsonb_agg(r),'[]'::jsonb) FROM (
    SELECT id,source,incident_key,start_at,planned_end_at,actual_end_at,state,settled_at,
      (SELECT count(*)::integer FROM sparks_runtime.maintenance_awards a WHERE a.incident_id=i.id) AS award_count,
      (SELECT coalesce(sum(amount),0)::integer FROM sparks_runtime.maintenance_awards a WHERE a.incident_id=i.id) AS sparks_paid,
      last_error
    FROM sparks_runtime.maintenance_incidents i ORDER BY start_at DESC LIMIT 25) r);
 ELSIF p_action='schedule' THEN
  IF p_key IS NULL OR length(p_key)>150 OR p_key !~ '^dashboard-[0-9TZ:.-]{15,45}$' THEN
    RAISE EXCEPTION 'Invalid maintenance key' USING ERRCODE='22023'; END IF;
  IF p_start_at IS NULL OR p_start_at<now()-interval '15 minutes' OR
     p_start_at>now()+interval '30 days' OR
     (p_planned_end_at IS NOT NULL AND
       (p_planned_end_at<=p_start_at OR p_planned_end_at>p_start_at+interval '31 days')) THEN
    RAISE EXCEPTION 'Invalid maintenance interval' USING ERRCODE='22023'; END IF;
  INSERT INTO sparks_runtime.maintenance_incidents
    (source,incident_key,start_at,planned_end_at,auto_close,created_by)
  VALUES('dashboard',p_key,p_start_at,p_planned_end_at,coalesce(p_auto_close,false),actor)
  ON CONFLICT(source,incident_key) DO NOTHING;
  SELECT * INTO row_data FROM sparks_runtime.maintenance_incidents
   WHERE source='dashboard' AND incident_key=p_key;
  RETURN jsonb_build_object('id',row_data.id,'state',row_data.state,'startAt',row_data.start_at);
 ELSIF p_action='close' THEN
  IF p_key IS NULL OR length(p_key)>150 THEN RAISE EXCEPTION 'Missing maintenance key' USING ERRCODE='22023'; END IF;
  UPDATE sparks_runtime.maintenance_incidents SET actual_end_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE source='dashboard' AND incident_key=p_key AND state='scheduled' AND actual_end_at IS NULL
    RETURNING * INTO row_data;
  IF row_data.id IS NULL THEN
    SELECT * INTO row_data FROM sparks_runtime.maintenance_incidents WHERE source='dashboard' AND incident_key=p_key;
  END IF;
  IF row_data.id IS NULL THEN RAISE EXCEPTION 'Maintenance incident not registered' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',row_data.id,'state',row_data.state,'actualEndAt',row_data.actual_end_at);
 END IF;
 RAISE EXCEPTION 'Unsupported compensation action' USING ERRCODE='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.qa_sparks_maintenance_compensation_v1(text,text,timestamptz,timestamptz,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qa_sparks_maintenance_compensation_v1(text,text,timestamptz,timestamptz,boolean)
 TO authenticated;
COMMIT;
-- Install pg_cron in a separate operation to avoid rollback of the schema if
-- extension provisioning is restricted; only the cron job processes credits.
