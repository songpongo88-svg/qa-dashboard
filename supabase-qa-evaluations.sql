create table if not exists public.qa_evaluations (
  id text primary key,
  evaluation_key text not null,
  case_id text not null,
  agent_name text not null,
  target_username text,
  target_display_name text,
  target_email text,
  target_role text,
  audit_date date,
  audit_timestamp text,
  waiting_time text,
  service_time text,
  case_url text,
  inquiry text,
  case_description text,
  evidence_urls jsonb not null default '[]'::jsonb,
  critical_error boolean not null default false,
  final_score numeric not null default 0,
  grade text,
  qa_scheme text,
  rubric_name text,
  rubric_period text,
  completed_topics integer not null default 0,
  total_topics integer not null default 0,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  raw_data_preview jsonb not null default '{}'::jsonb,
  evaluator_username text,
  evaluator_name text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qa_evaluations_case_id_idx on public.qa_evaluations (case_id);
create index if not exists qa_evaluations_agent_name_idx on public.qa_evaluations (agent_name);
create index if not exists qa_evaluations_audit_date_idx on public.qa_evaluations (audit_date);
create index if not exists qa_evaluations_submitted_at_idx on public.qa_evaluations (submitted_at desc);

alter table public.qa_evaluations enable row level security;

drop policy if exists "allow qa evaluation insert" on public.qa_evaluations;
create policy "allow qa evaluation insert"
on public.qa_evaluations
for insert
to anon
with check (true);

drop policy if exists "allow qa evaluation read" on public.qa_evaluations;
create policy "allow qa evaluation read"
on public.qa_evaluations
for select
to anon
using (true);

drop policy if exists "allow qa evaluation update" on public.qa_evaluations;
create policy "allow qa evaluation update"
on public.qa_evaluations
for update
to anon
using (true)
with check (true);

drop policy if exists "allow qa evaluation delete" on public.qa_evaluations;
create policy "allow qa evaluation delete"
on public.qa_evaluations
for delete
to anon
using (true);
