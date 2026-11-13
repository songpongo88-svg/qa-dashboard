-- PROPOSED. Do not deploy until QA Dashboard primary login is backed by verified Supabase Auth.
-- All operations use auth.uid() / verified Supabase JWT. Client-supplied username never grants access.
begin;
create schema if not exists qa_security;
revoke all on schema qa_security from public, anon, authenticated;

create table if not exists qa_security.active_sessions (
  account_id text primary key,
  session_id uuid not null,
  session_version bigint not null default 1,
  device_summary text not null default 'Unknown browser',
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);
create table if not exists qa_security.takeover_requests (
  request_id uuid primary key default gen_random_uuid(),
  account_id text not null,
  expected_session_id uuid not null,
  proposed_session_id uuid not null,
  status text not null check(status in ('pending','ready','committed','cancelled')),
  requested_at timestamptz not null default now(),
  deadline_at timestamptz not null default (now()+interval '30 seconds'),
  acknowledged_revision bigint
);
create index if not exists qa_takeover_account_idx on qa_security.takeover_requests(account_id, requested_at desc);
create table if not exists qa_security.session_audit (
  audit_id bigint generated always as identity primary key,
  account_id text not null,
  actor_session_id uuid,
  action text not null,
  created_at timestamptz not null default now()
);
create table if not exists qa_security.draft_receipts (
  account_id text not null,
  document_key text not null,
  revision bigint not null check(revision>=0),
  session_id uuid not null,
  saved_at timestamptz not null default now(),
  primary key(account_id,document_key)
);
alter table qa_security.active_sessions enable row level security;
alter table qa_security.takeover_requests enable row level security;
alter table qa_security.session_audit enable row level security;
alter table qa_security.draft_receipts enable row level security;
revoke all on all tables in schema qa_security from public,anon,authenticated;

-- Authenticated user can interact only with the server-verified QA identity.
-- This function does not authorize QA writes elsewhere; every sensitive mutation
-- must call an active-session guard at its own trusted server boundary.
create or replace function public.qa_session_control_v1(
  p_action text, p_request_id uuid default null, p_revision bigint default null
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor text;
  v_session uuid;
  v_active qa_security.active_sessions%rowtype;
  v_request qa_security.takeover_requests%rowtype;
  v_new uuid;
begin
  select lower(btrim(v.username)) into v_actor
  from public.sparks_verified_identity_v1() v limit 1;
  if v_actor is null then raise exception 'QA identity not verified' using errcode='42501'; end if;
  if auth.uid() is null then raise exception 'No signed-in user' using errcode='42501'; end if;
  if coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'Signed-in session required' using errcode='42501';
  end if;
  v_session := (auth.jwt()->>'session_id')::uuid;
  -- Serialize concurrent requests for the same QA account.
  perform pg_advisory_xact_lock(hashtextextended(v_actor, 81672026));
  select * into v_active from qa_security.active_sessions where account_id=v_actor for update;
  if p_action='begin' then
    if not found or v_active.expires_at <= now() then
      insert into qa_security.active_sessions(account_id,session_id,session_version)
      values(v_actor,v_session,1)
      on conflict(account_id) do update set session_id=excluded.session_id,
        session_version=qa_security.active_sessions.session_version+1,
        last_activity_at=now(),expires_at=now()+interval '30 minutes';
      insert into qa_security.session_audit(account_id,actor_session_id,action) values(v_actor,v_session,'login');
      return jsonb_build_object('status','active','expiresInSeconds',1800);
    end if;
    if v_active.session_id=v_session then
      update qa_security.active_sessions set last_activity_at=now(), expires_at=now()+interval '30 minutes'
      where account_id=v_actor;
      return jsonb_build_object('status','active','expiresInSeconds',1800);
    end if;
    return jsonb_build_object('status','conflict','deviceLabel',left(v_active.device_summary,80));
  elsif p_action='request' then
    if not found or v_active.expires_at<=now() or v_active.session_id=v_session then
      raise exception 'No conflicting session' using errcode='22023';
    end if;
    insert into qa_security.takeover_requests(account_id,expected_session_id,proposed_session_id,status)
      values(v_actor,v_active.session_id,v_session,'pending')
      returning * into v_request;
    insert into qa_security.session_audit(account_id,actor_session_id,action) values(v_actor,v_session,'takeover_requested');
    return jsonb_build_object('status','pending','requestId',v_request.request_id,'deadlineAt',v_request.deadline_at);
  elsif p_action='ack' then
    if p_request_id is null or p_revision is null or p_revision<0 then
      raise exception 'Missing persisted draft revision' using errcode='22023';
    end if;
    select * into v_request from qa_security.takeover_requests where request_id=p_request_id and account_id=v_actor for update;
    if not found or v_request.status<>'pending' or v_request.deadline_at<now() or
       v_request.expected_session_id<>v_session or v_active.session_id<>v_session then
       raise exception 'Takeover acknowledgment not permitted' using errcode='42501';
    end if;
    -- The caller must first save all dirty form content into the authoritative draft store.
    -- A numeric acknowledgment alone is NOT a durable server receipt.
    if not exists (
      select 1 from qa_security.draft_receipts d
      where d.account_id=v_actor and d.session_id=v_session and d.revision>=p_revision
        and d.saved_at >= v_request.requested_at
    ) then
      raise exception 'No durable draft receipt for takeover' using errcode='42501';
    end if;
    update qa_security.takeover_requests set status='ready',acknowledged_revision=p_revision where request_id=p_request_id;
    return jsonb_build_object('status','ready');
  elsif p_action='commit' then
    if p_request_id is null then raise exception 'Missing takeover request' using errcode='22023'; end if;
    select * into v_request from qa_security.takeover_requests where request_id=p_request_id and account_id=v_actor for update;
    if not found or v_request.status<>'ready' or v_request.proposed_session_id<>v_session or
       v_request.deadline_at<now() or v_active.session_id<>v_request.expected_session_id then
      raise exception 'Takeover not ready or was superseded' using errcode='42501';
    end if;
    update qa_security.active_sessions
       set session_id=v_session,session_version=session_version+1,
           last_activity_at=now(),expires_at=now()+interval '30 minutes'
     where account_id=v_actor;
    update qa_security.takeover_requests set status='committed' where request_id=p_request_id;
    insert into qa_security.session_audit(account_id,actor_session_id,action) values(v_actor,v_session,'takeover_committed');
    return jsonb_build_object('status','active','expiresInSeconds',1800);
  elsif p_action='validate' then
    if not found or v_active.session_id<>v_session or v_active.expires_at<=now() then
      return jsonb_build_object('status','revoked');
    end if;
    return jsonb_build_object('status','active');
  elsif p_action='logout' then
    if found and v_active.session_id=v_session then
      delete from qa_security.active_sessions where account_id=v_actor;
      insert into qa_security.session_audit(account_id,actor_session_id,action) values(v_actor,v_session,'logout');
    end if;
    return jsonb_build_object('status','logged_out');
  end if;
  raise exception 'Unsupported action' using errcode='22023';
end
$fn$;
revoke all on function public.qa_session_control_v1(text,uuid,bigint) from public,anon;
grant execute on function public.qa_session_control_v1(text,uuid,bigint) to authenticated;
commit;

-- WARNING: this is not ready for deployment:
-- draft_receipts writer and all-form dirty-set reconciliation must be implemented.
-- A single receipt is insufficient if multiple forms have unsynced edits.
