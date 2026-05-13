create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  username text,
  display_name text,
  role text,
  agent_name text,
  tab text,
  case_id text,
  target_agent text,
  details jsonb default '{}'::jsonb,
  user_agent text,
  page_url text,
  session_login_at timestamptz
);

create index if not exists usage_logs_created_at_idx on public.usage_logs (created_at desc);
create index if not exists usage_logs_username_idx on public.usage_logs (username);
create index if not exists usage_logs_event_type_idx on public.usage_logs (event_type);
create index if not exists usage_logs_case_id_idx on public.usage_logs (case_id);

alter table public.usage_logs enable row level security;

drop policy if exists "allow usage log insert" on public.usage_logs;
create policy "allow usage log insert"
on public.usage_logs
for insert
to anon
with check (true);

drop policy if exists "allow usage log read" on public.usage_logs;
create policy "allow usage log read"
on public.usage_logs
for select
to anon
using (true);
