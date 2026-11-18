-- Authorized one-time QA Sparks award: Thank you Support, 18 November 2026.
-- Run ONCE after the matching application Production deployment is READY.
-- All 10 awards commit atomically in the private Supabase Sparks runtime.
-- Re-running is idempotent against fixed per-account ledger IDs. Never add
-- more points for Nov 21/22 popup reminders.
BEGIN;
DO $grant$
DECLARE
  item record;
  target_profile jsonb;
  prior_wallet jsonb;
  prior_ledger jsonb;
  wallet_path text;
  receipt_path text;
  award_at text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  current_balance bigint;
  current_lifetime bigint;
  current_annual bigint;
  current_orders bigint;
  next_balance bigint;
  next_fields jsonb;
  receipt_fields jsonb;
  n_profiles integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('qa-sparks-thank-you-support-2026'));
  FOR item IN
    SELECT * FROM (VALUES
      ('krivut','Krivut Vongkampan',1000),
      ('jureeporn','Jureeporn Piddum',1000),
      ('natcha','Natcha Chai-in',1000),
      ('warrathanun','Warrathanun Rinjumrus',1000),
      ('chachiya','Chachiya Thawiwong',1000),
      ('darunee','Darunee Teparsa',500),
      ('nithikorn','Nithikorn wongsuntorn',500),
      ('suwadee','Suwadee Dechpong',500),
      ('sarika','Sarika Leksung',1000),
      ('songpon','Songpon Phothong',1000)
    ) AS recipients(username, expected_name, amount)
  LOOP
    SELECT count(*),(jsonb_agg(profile))->0 INTO n_profiles,target_profile
      FROM qa_migration.sparks_profile_reconciliation_v1
      WHERE lower(btrim(profile->>'username'))=item.username
        AND reviewed=true
        AND snapshot_imported_at>=clock_timestamp()-interval '7 days'
        AND lower(btrim(profile->>'status'))='active'
        AND NOT (
          nullif(profile->>'suspendEffectiveDate','') IS NOT NULL
          AND (profile->>'suspendEffectiveDate') <= to_char(clock_timestamp() at time zone 'Asia/Bangkok','YYYY-MM-DD')
          AND NOT (
            coalesce((profile->>'suspendAutoReactivate')::boolean,false)
            AND nullif(profile->>'suspendEndDate','') IS NOT NULL
            AND (profile->>'suspendEndDate')<=to_char(clock_timestamp() at time zone 'Asia/Bangkok','YYYY-MM-DD')
          )
        );
    IF n_profiles<>1 OR target_profile IS NULL THEN
      RAISE EXCEPTION 'THANK_YOU_RECIPIENT_NOT_VERIFIED: %',item.username;
    END IF;
    wallet_path:='qa_sparks_wallets/'||item.username;
    receipt_path:=wallet_path||'/history/thank-you-support-2026';
    SELECT fields INTO prior_ledger FROM sparks_runtime.documents WHERE source_path=receipt_path;
    IF prior_ledger IS NOT NULL THEN
      IF prior_ledger->'source'->>'stringValue'<>'thank-you-support-2026'
        OR prior_ledger->'amount'->>'integerValue'<>item.amount::text
        OR prior_ledger->'username'->>'stringValue'<>item.username THEN
        RAISE EXCEPTION 'THANK_YOU_LEDGER_CONFLICT: %',item.username;
      END IF;
      CONTINUE;
    END IF;
    SELECT fields INTO prior_wallet FROM sparks_runtime.documents WHERE source_path=wallet_path FOR UPDATE;
    prior_wallet:=coalesce(prior_wallet,'{}'::jsonb);
    current_balance:=case when coalesce((prior_wallet->'balanceYear'->>'integerValue')::integer,2026)=2026
      then coalesce((prior_wallet->'balance'->>'integerValue')::bigint,0) else 0 end;
    current_lifetime:=coalesce((prior_wallet->'totalEarned'->>'integerValue')::bigint,0);
    current_annual:=case when coalesce((prior_wallet->'memberYear'->>'integerValue')::integer,2026)=2026
      then coalesce((prior_wallet->'memberYearEarned'->>'integerValue')::bigint,current_lifetime) else 0 end;
    current_orders:=coalesce((prior_wallet->'rewardOrders'->>'integerValue')::bigint,0);
    next_balance:=current_balance+item.amount;
    next_fields:=prior_wallet||jsonb_build_object(
      'username',jsonb_build_object('stringValue',item.username),
      'balance',jsonb_build_object('integerValue',next_balance::text),
      'balanceYear',jsonb_build_object('integerValue','2026'),
      'memberYear',jsonb_build_object('integerValue','2026'),
      'memberYearEarned',jsonb_build_object('integerValue',(current_annual+item.amount)::text),
      'totalEarned',jsonb_build_object('integerValue',(current_lifetime+item.amount)::text),
      'rewardOrders',jsonb_build_object('integerValue',current_orders::text),
      'thankYouSupportGrantedAt2026',jsonb_build_object('stringValue',award_at),
      'updatedAt',jsonb_build_object('stringValue',award_at)
    );
    INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
      VALUES(wallet_path,next_fields,award_at,award_at)
      ON CONFLICT(source_path) DO UPDATE SET fields=excluded.fields,update_time=excluded.update_time;
    receipt_fields:=jsonb_build_object(
      'createdAt',jsonb_build_object('stringValue',award_at),
      'username',jsonb_build_object('stringValue',item.username),
      'type',jsonb_build_object('stringValue','earn'),
      'source',jsonb_build_object('stringValue','thank-you-support-2026'),
      'title',jsonb_build_object('stringValue','Thank you Support'),
      'detail',jsonb_build_object('stringValue',case when item.amount=1000
        then '21–22 Nov 2026 · equivalent to 500 Sparks per day · credited in full once'
        else '21–22 Nov 2026 · 500 Sparks total · credited in full once' end),
      'amount',jsonb_build_object('integerValue',item.amount::text),
      'balanceAfter',jsonb_build_object('integerValue',next_balance::text),
      'performedBy',jsonb_build_object('stringValue','QA Sparks System'),
      'status',jsonb_build_object('stringValue','Completed')
    );
    INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
      VALUES(receipt_path,receipt_fields,award_at,award_at);
  END LOOP;
END
$grant$;
COMMIT;
-- After the transaction verify EXACTLY 10 immutable histories and 8,500 Sparks.
