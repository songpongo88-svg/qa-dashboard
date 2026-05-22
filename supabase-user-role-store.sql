create table if not exists public.qa_user_profiles (
  username text primary key,
  display_name text not null,
  agent_name text not null,
  email text,
  role text not null,
  team_lead text,
  team_name text,
  status text not null default 'Active',
  suspend_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_role_definitions (
  name text primary key,
  description text,
  active boolean not null default true,
  locked boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_role_permissions (
  role_name text primary key,
  permissions jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_system_settings (
  id text primary key,
  enabled boolean not null default false,
  message text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists qa_user_profiles_role_idx on public.qa_user_profiles (role);
create index if not exists qa_user_profiles_status_idx on public.qa_user_profiles (status);
create index if not exists qa_user_profiles_team_name_idx on public.qa_user_profiles (team_name);

alter table public.qa_user_profiles enable row level security;
alter table public.qa_role_definitions enable row level security;
alter table public.qa_role_permissions enable row level security;
alter table public.qa_system_settings enable row level security;

drop policy if exists "allow qa user profile read" on public.qa_user_profiles;
create policy "allow qa user profile read"
on public.qa_user_profiles
for select
to anon
using (true);

drop policy if exists "allow qa user profile upsert" on public.qa_user_profiles;
create policy "allow qa user profile upsert"
on public.qa_user_profiles
for all
to anon
using (true)
with check (true);

drop policy if exists "allow qa role definition read" on public.qa_role_definitions;
create policy "allow qa role definition read"
on public.qa_role_definitions
for select
to anon
using (true);

drop policy if exists "allow qa role definition write" on public.qa_role_definitions;
create policy "allow qa role definition write"
on public.qa_role_definitions
for all
to anon
using (true)
with check (true);

drop policy if exists "allow qa role permission read" on public.qa_role_permissions;
create policy "allow qa role permission read"
on public.qa_role_permissions
for select
to anon
using (true);

drop policy if exists "allow qa role permission write" on public.qa_role_permissions;
create policy "allow qa role permission write"
on public.qa_role_permissions
for all
to anon
using (true)
with check (true);

drop policy if exists "allow qa system settings read" on public.qa_system_settings;
create policy "allow qa system settings read"
on public.qa_system_settings
for select
to anon
using (true);

drop policy if exists "allow qa system settings write" on public.qa_system_settings;
create policy "allow qa system settings write"
on public.qa_system_settings
for all
to anon
using (true)
with check (true);
