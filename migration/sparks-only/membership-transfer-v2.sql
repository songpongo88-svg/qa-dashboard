-- Membership Card + Spark Transfer v2. Re-runnable, private card and escrow storage.
-- Apply to the verified QA Sparks Supabase project. Never expose PIN hashes.
create schema if not exists sparks_transfer;
revoke all on schema sparks_transfer from public,anon,authenticated;
create table if not exists sparks_transfer.cards (
 username text primary key check(username ~ '^[a-z0-9._-]{2,90}$'),
 card_number text unique not null,
 pin_hash text not null,
 active boolean not null default true,
 failed_attempts integer not null default 0,
 locked_until timestamptz,
 issued_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists sparks_transfer.card_audit(
 id bigint generated always as identity primary key, username text not null,
 card_number text not null, action text not null, at timestamptz not null default now()
);
create table if not exists sparks_transfer.transfers(
 id uuid primary key default gen_random_uuid(),request_id text not null,
 sender text not null,recipient text not null,
 amount integer not null check(amount between 1 and 500),
 status text not null default 'pending' check(status in ('pending','accepted','expired')),
 sent_at timestamptz not null default now(),expires_at timestamptz not null default (now()+interval '72 hours'),
 settled_at timestamptz,unique(sender,request_id),check(sender<>recipient)
);
create index if not exists sparks_transfer_inbox_idx on sparks_transfer.transfers(recipient,status,expires_at);
create index if not exists sparks_transfer_expiry_idx on sparks_transfer.transfers(expires_at) where status='pending';
revoke all on all tables in schema sparks_transfer from public,anon,authenticated;
alter table sparks_transfer.cards enable row level security;
alter table sparks_transfer.card_audit enable row level security;
alter table sparks_transfer.transfers enable row level security;

CREATE OR REPLACE FUNCTION sparks_transfer.wallet_move(p_username text, p_amount bigint, p_reference text, p_source text, p_detail text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p text:='qa_sparks_wallets/'||p_username; rowdata sparks_runtime.documents%rowtype; v_balance bigint; v_next bigint; v_stamp text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p,0));
 select * into rowdata from sparks_runtime.documents where source_path=p for update;
 if not found then raise exception 'SPARKS_WALLET_NOT_FOUND' using errcode='22023';end if;
 v_balance:=coalesce(nullif(rowdata.fields #>> '{balance,integerValue}','')::bigint,0);
 if coalesce(nullif(rowdata.fields #>> '{balanceYear,integerValue}','')::integer,extract(year from now() at time zone 'Asia/Bangkok')::integer)<>extract(year from now() at time zone 'Asia/Bangkok')::integer then
   v_balance:=0;
 end if;
 v_next:=v_balance+p_amount;
 if v_next<0 or v_next>900000000000000000 then raise exception 'SPARKS_INSUFFICIENT_BALANCE' using errcode='22023'; end if;
 v_stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 update sparks_runtime.documents set fields= jsonb_set(
    jsonb_set(jsonb_set(rowdata.fields,'{balance}',jsonb_build_object('integerValue',v_next::text)),
      '{balanceYear}',jsonb_build_object('integerValue',extract(year from now() at time zone 'Asia/Bangkok')::integer::text)),
      '{updatedAt}',jsonb_build_object('stringValue',v_stamp)), update_time=v_stamp where source_path=p;
 insert into sparks_runtime.documents(source_path,fields,create_time,update_time) values (
   'qa_sparks_wallets/'||p_username||'/history/'||p_reference,
   jsonb_build_object('createdAt',jsonb_build_object('stringValue',v_stamp),
   'type',jsonb_build_object('stringValue',case when p_amount>0 then 'earn' else 'spend' end),
   'source',jsonb_build_object('stringValue',p_source),
   'title',jsonb_build_object('stringValue',case when p_amount>0 then 'รับ / คืน Sparks' else 'โอน Sparks ให้เพื่อน' end),
   'detail',jsonb_build_object('stringValue',p_detail),
   'amount',jsonb_build_object('integerValue',p_amount::text),
   'balanceAfter',jsonb_build_object('integerValue',v_next::text),
   'performedBy',jsonb_build_object('stringValue',p_username),
   'status',jsonb_build_object('stringValue','Completed')),
   v_stamp,v_stamp);
 return v_next;
end $function$

CREATE OR REPLACE FUNCTION sparks_transfer.expire_due(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare x sparks_transfer.transfers%rowtype; n integer:=0; v_year integer;
begin
 for x in select * from sparks_transfer.transfers where status='pending' and expires_at<=now()
 order by expires_at,id for update skip locked limit least(greatest(p_limit,1),500)
 loop
   perform sparks_transfer.wallet_move(x.sender,x.amount::bigint,
     'peer-transfer-refund-'||x.id::text,'sparks-peer-transfer-refund',
     'หมดเวลารับ 72 ชั่วโมง · คืน '||x.amount||' Sparks จากรายการ '||x.id::text);
   update sparks_transfer.transfers set status='expired',settled_at=now() where id=x.id;
   n:=n+1;
 end loop;
 return n;
end $function$

create or replace function sparks_transfer.legacy_sent(p_username text)
returns bigint language sql stable security definer set search_path='' as $$
 select coalesce((
   select nullif(fields #>> '{sent,integerValue}','')::bigint
   from sparks_runtime.documents
   where source_path='qa_sparks_transfer_monthly_v1/'||p_username||'-'||to_char(now() at time zone 'Asia/Bangkok','YYYY-MM')
 ),0)::bigint
$$;
revoke all on function sparks_transfer.legacy_sent(text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.sparks_transfer_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 me text; currentcard sparks_transfer.cards%rowtype; recipientcard sparks_transfer.cards%rowtype;
 v_username text; v_pin text; v_new_pin text; v_card text;
 v_target text; v_display text; v_request text; v_amount integer; v_used bigint;
 v_id uuid; v_transfer sparks_transfer.transfers%rowtype; v_today_year integer;
 v_balance bigint; v_month_start timestamptz; v_now timestamptz:=now(); v_ok boolean;
begin
 if (select auth.uid()) is null then raise exception 'SPARKS_AUTH_REQUIRED' using errcode='42501';end if;
 select lower(btrim(i.username)) into me from public.sparks_verified_identity_v1() i limit 1;
 if me is null or me !~ '^[a-z0-9._-]{2,90}$' then raise exception 'SPARKS_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501';end if;
 select * into currentcard from sparks_transfer.cards where username=me;
 v_pin:=coalesce(p_payload->>'pin','');
 v_today_year:=extract(year from v_now at time zone 'Asia/Bangkok')::integer;
 v_month_start:=date_trunc('month',v_now at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
 if p_action='card-state' then
   return jsonb_build_object('ok',true,'cardActive',coalesce(currentcard.active,false),
    'cardNumber',case when currentcard.active then currentcard.card_number else null end,
    'pinConfigured',coalesce(currentcard.active,false),
    'lockedUntil',case when currentcard.locked_until>v_now then currentcard.locked_until else null end);
 elsif p_action in ('card-activate','card-reissue') then
   v_new_pin:=coalesce(p_payload->>'newPin','');
   if v_new_pin !~ '^[0-9]{6}$' or v_new_pin<>coalesce(p_payload->>'confirmPin','') then
    raise exception 'PIN_NEW_INVALID' using errcode='22023';
   end if;
   if p_action='card-activate' and currentcard.username is not null and currentcard.active then
    raise exception 'CARD_ALREADY_ACTIVE' using errcode='22023';
   end if;
   if p_action='card-reissue' and (currentcard.username is null or not currentcard.active or p_payload->>'confirm' <> 'REISSUE') then
    raise exception 'CARD_REISSUE_CONFIRM_REQUIRED' using errcode='22023';
   end if;
   v_card:='QS-'||v_today_year||'-'||upper(replace(gen_random_uuid()::text,'-',''))::text;
   if p_action='card-activate' and currentcard.username is null then
     select fields #>> '{memberCardNumber,stringValue}' into v_target
       from sparks_runtime.documents where source_path='qa_sparks_wallets/'||me;
     if v_target ~ '^QS-2026-[A-F0-9]{20}$'
      and not exists(select 1 from sparks_transfer.cards where card_number=v_target)
      then v_card:=v_target;end if;
   end if;
   insert into sparks_transfer.cards(username,card_number,pin_hash,active,failed_attempts,locked_until,updated_at)
   values(me,v_card,extensions.crypt(v_new_pin,extensions.gen_salt('bf',11)),true,0,null,v_now)
   on conflict(username) do update set card_number=excluded.card_number,pin_hash=excluded.pin_hash,
       active=true,failed_attempts=0,locked_until=null,updated_at=v_now;
   insert into sparks_transfer.card_audit(username,card_number,action) values(me,v_card,p_action);
   return jsonb_build_object('ok',true,'cardActive',true,'cardNumber',v_card);
 elsif p_action in ('pin-verify','pin-change','transfer-submit') then
   if currentcard.username is null or not currentcard.active then raise exception 'CARD_NOT_ACTIVE' using errcode='22023';end if;
   if currentcard.locked_until>v_now then return jsonb_build_object('ok',false,'error','PIN_TEMPORARILY_LOCKED','lockedUntil',currentcard.locked_until);end if;
   v_ok:=v_pin ~ '^[0-9]{6}$' and extensions.crypt(v_pin,currentcard.pin_hash)=currentcard.pin_hash;
   if not v_ok then
     update sparks_transfer.cards set failed_attempts=case when failed_attempts>=4 then 0 else failed_attempts+1 end,
       locked_until=case when failed_attempts>=4 then v_now+interval '15 minutes' else null end
     where username=me;
     return jsonb_build_object('ok',false,'error','PIN_INCORRECT');
   end if;
   update sparks_transfer.cards set failed_attempts=0,locked_until=null where username=me;
   if p_action='pin-verify' then return jsonb_build_object('ok',true,'verified',true);end if;
   if p_action='pin-change' then
     v_new_pin:=coalesce(p_payload->>'newPin','');
     if v_new_pin !~ '^[0-9]{6}$' or v_new_pin<>coalesce(p_payload->>'confirmPin','')
       then raise exception 'PIN_NEW_INVALID' using errcode='22023';end if;
     update sparks_transfer.cards set pin_hash=extensions.crypt(v_new_pin,extensions.gen_salt('bf',11)),updated_at=v_now where username=me;
     insert into sparks_transfer.card_audit(username,card_number,action) values(me,currentcard.card_number,'pin-change');
     return jsonb_build_object('ok',true,'changed',true);
   end if;
 elsif p_action not in ('recipient-lookup','transfer-state','transfer-accept') then
   raise exception 'UNSUPPORTED_TRANSFER_ACTION' using errcode='22023';
 end if;

 if p_action='recipient-lookup' or p_action='transfer-submit' then
   v_card:=coalesce(p_payload->>'recipientCard','');
   select * into recipientcard from sparks_transfer.cards where card_number=v_card and active for share;
   if recipientcard.username is null or recipientcard.username=me then raise exception 'RECIPIENT_CARD_NOT_FOUND' using errcode='22023';end if;
   v_target:=recipientcard.username;
   select coalesce(nullif(btrim(s.profile->>'displayName'),''),v_target) into v_display
     from qa_migration.sparks_profile_reconciliation_v1 s where lower(btrim(s.profile->>'username'))=v_target
       and s.reviewed=true and s.snapshot_imported_at>=v_now-interval '7 days'
       and lower(btrim(s.profile->>'status'))='active'
       and not (nullif(s.profile->>'suspendEffectiveDate','') is not null
         and s.profile->>'suspendEffectiveDate'<=to_char(v_now at time zone 'Asia/Bangkok','YYYY-MM-DD')
         and not(coalesce((s.profile->>'suspendAutoReactivate')::boolean,false)
           and nullif(s.profile->>'suspendEndDate','') is not null
           and s.profile->>'suspendEndDate'<=to_char(v_now at time zone 'Asia/Bangkok','YYYY-MM-DD')));
   if v_display is null then raise exception 'RECIPIENT_NOT_ACTIVE' using errcode='22023';end if;
   if p_action='recipient-lookup' then return jsonb_build_object('ok',true,'recipientName',v_display,'recipientCard',v_card);end if;
 end if;

 if p_action='transfer-state' then
   select coalesce((select (fields #>> '{balance,integerValue}')::bigint
      from sparks_runtime.documents where source_path='qa_sparks_wallets/'||me
      and coalesce((fields #>> '{balanceYear,integerValue}')::integer,v_today_year)=v_today_year),0) into v_balance;
   select coalesce(sum(amount),0) into v_used from sparks_transfer.transfers
      where sender=me and status in ('pending','accepted')
      and sent_at>=v_month_start and sent_at<v_month_start+interval '1 month';
   v_used:=v_used+sparks_transfer.legacy_sent(me);
   return jsonb_build_object('ok',true,'cardActive',coalesce(currentcard.active,false),
     'cardNumber',case when currentcard.active then currentcard.card_number else null end,
     'balance',v_balance,'sentThisMonth',v_used,'remaining',greatest(0,500-v_used),
     'monthlyLimit',500,
     'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'amount',t.amount,'sender',t.sender,'expiresAt',t.expires_at,'status',t.status) order by t.sent_at desc)
       from sparks_transfer.transfers t where t.recipient=me and t.status='pending' and t.expires_at>v_now),'[]'::jsonb),
     'history',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'amount',t.amount,'sender',t.sender,'recipient',t.recipient,'status',
        case when t.status='pending' and t.expires_at<=v_now then 'expired' else t.status end,
        'sentAt',t.sent_at,'expiresAt',t.expires_at) order by t.sent_at desc)
       from (select * from sparks_transfer.transfers where sender=me or recipient=me order by sent_at desc limit 30) t),'[]'::jsonb));
 end if;
 if p_action='transfer-submit' then
   v_request:=coalesce(p_payload->>'requestId','');
   v_amount:=nullif(p_payload->>'amount','')::integer;
   if v_request !~ '^[A-Za-z0-9_-]{16,100}$' or v_amount is null or v_amount<1 or v_amount>500 then raise exception 'INVALID_TRANSFER' using errcode='22023';end if;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('spark-transfer:'||me,0));
   select * into v_transfer from sparks_transfer.transfers where sender=me and request_id=v_request;
   if found then
     if v_transfer.recipient<>v_target or v_transfer.amount<>v_amount then raise exception 'TRANSFER_ID_CONFLICT' using errcode='22023';end if;
     return jsonb_build_object('ok',true,'alreadyApplied',true,'transferId',v_transfer.id,'status',v_transfer.status);
   end if;
   select coalesce(sum(amount),0) into v_used from sparks_transfer.transfers where sender=me
      and status in ('pending','accepted') and sent_at>=v_month_start and sent_at<v_month_start+interval '1 month';
   v_used:=v_used+sparks_transfer.legacy_sent(me);
   if v_used+v_amount>500 then raise exception 'TRANSFER_MONTHLY_LIMIT' using errcode='22023';end if;
   v_id:=gen_random_uuid();
   perform sparks_transfer.wallet_move(me,-v_amount::bigint,'peer-transfer-hold-'||v_id::text,'sparks-peer-transfer-hold',
     'พัก '||v_amount||' Sparks เพื่อส่งให้บัตรสมาชิก '||v_card||' · รอรับภายใน 72 ชั่วโมง');
   insert into sparks_transfer.transfers(id,request_id,sender,recipient,amount,status)
    values(v_id,v_request,me,v_target,v_amount,'pending');
   return jsonb_build_object('ok',true,'status','pending','transferId',v_id,'amount',v_amount,'recipientName',v_display,'expiresAt',v_now+interval '72 hours');
 end if;
 if p_action='transfer-accept' then
   if not coalesce(currentcard.active,false) then raise exception 'CARD_NOT_ACTIVE' using errcode='22023';end if;
   v_id:=(p_payload->>'transferId')::uuid;
   select * into v_transfer from sparks_transfer.transfers where id=v_id for update;
   if not found or v_transfer.recipient<>me then raise exception 'TRANSFER_NOT_FOUND' using errcode='22023';end if;
   if v_transfer.status='accepted' then return jsonb_build_object('ok',true,'alreadyApplied',true,'status','accepted');end if;
   if v_transfer.status='expired' then raise exception 'TRANSFER_EXPIRED' using errcode='22023';end if;
   if v_transfer.expires_at<=v_now then
     perform sparks_transfer.wallet_move(v_transfer.sender,v_transfer.amount::bigint,
       'peer-transfer-refund-'||v_transfer.id::text,'sparks-peer-transfer-refund',
       'ครบ 72 ชั่วโมง · คืน '||v_transfer.amount||' Sparks');
     update sparks_transfer.transfers set status='expired',settled_at=v_now where id=v_id;
     return jsonb_build_object('ok',false,'status','expired','error','TRANSFER_EXPIRED');
   end if;
   perform sparks_transfer.wallet_move(me,v_transfer.amount::bigint,
     'peer-transfer-accepted-'||v_transfer.id::text,'sparks-peer-transfer-accepted',
     'รับ '||v_transfer.amount||' Sparks จาก '||v_transfer.sender);
   update sparks_transfer.transfers set status='accepted',settled_at=v_now where id=v_id;
   return jsonb_build_object('ok',true,'status','accepted','amount',v_transfer.amount);
 end if;
 raise exception 'UNSUPPORTED_TRANSFER_ACTION' using errcode='22023';
end $function$


revoke all on all functions in schema sparks_transfer from public,anon,authenticated;
revoke all on function public.sparks_transfer_v2(text,jsonb) from public,anon;
grant execute on function public.sparks_transfer_v2(text,jsonb) to authenticated;
select cron.schedule('qa-sparks-transfer-expiry','* * * * *','SELECT sparks_transfer.expire_due(200);');
