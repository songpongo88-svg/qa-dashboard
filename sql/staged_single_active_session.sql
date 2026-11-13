-- STAGED ONLY: do not run until trusted QA login API is ready.
-- Server-owned session state. All operations require a verified user identity.
begin;
create schema if not exists qa_security;
revoke all on schema qa_security from public, anon, authenticated;

create table if not exists qa_security.active_sessions (
  account_id text primary key,
  session_id uuid not null unique,
  session_version bigint not null default 1 check (session_version >= 1),
  device_summary text,
  issued_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists qa_security.takeover_requests (
  request_id uuid primary key,
  account_id text not null,
  expected_session_id uuid,
  proposed_session_id uuid not null,
  status text not null check (status in ('pending','consented','flushing','ready','unsynced','cancelled','committed')),
  requested_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  acknowledged_revision bigint check (acknowledged_revision is null or acknowledged_revision >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists qa_takeover_requests_account_idx
  on qa_security.takeover_requests(account_id, requested_at desc);

create table if not exists qa_security.session_audit (
  audit_id bigint generated always as identity primary key,
  account_id text not null,
  session_id uuid,
  actor_account_id text,
  action text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index if not exists qa_session_audit_account_idx
  on qa_security.session_audit(account_id, occurred_at desc);

create table if not exists qa_security.draft_receipts (
  account_id text not null,
  document_key text not null,
  revision bigint not null check (revision >= 0),
  session_id uuid not null,
  persisted_at timestamptz not null default now(),
  primary key (account_id, document_key)
);

alter table qa_security.active_sessions enable row level security;
alter table qa_security.takeover_requests enable row level security;
alter table qa_security.session_audit enable row level security;
alter table qa_security.draft_receipts enable row level security;
revoke all on all tables in schema qa_security from public, anon, authenticated;
commit;

-- Deployment gate: no API should accept a username supplied by the browser as
-- proof of identity. Create a trusted login/session service; authenticate
-- each request; and perform compare-and-swap of active_sessions in ONE DB
-- transaction. Session checks are required on every sensitive mutation.
