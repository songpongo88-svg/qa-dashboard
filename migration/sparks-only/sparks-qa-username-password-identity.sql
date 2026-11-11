-- Authenticated QA users continue to use the original email identity or a
-- verified, admin-created internal QA username/password identity.
-- Only service-role admin migration can set raw_app_meta_data, never a client.
-- This intentionally keeps the existing seven-day reviewed roster freshness gate.
create or replace function public.sparks_verified_identity_v1()
returns table(username text, display_name text, role text, status text)
language sql stable security definer
set search_path = ''
as $function$
  select s.profile->>'username',s.profile->>'displayName',s.profile->>'role','Active'::text
  from auth.users u
  join qa_migration.sparks_profile_reconciliation_v1 s
    on (
      lower(btrim(s.profile->>'email'))=lower(btrim(u.email))
      or (
        u.raw_app_meta_data->>'qa_auth_source'='qa-dashboard-migrated'
        and lower(btrim(u.raw_app_meta_data->>'qa_username'))=lower(btrim(s.profile->>'username'))
        and lower(btrim(u.email))='qa-'||lower(btrim(s.profile->>'username'))||'@qa-sparks-login.invalid'
      )
    )
  where u.id=auth.uid()
    and u.email_confirmed_at is not null
    and nullif(btrim(u.email),'') is not null
    and s.reviewed is true
    and s.snapshot_imported_at>=now()-interval '7 days'
    and lower(btrim(s.profile->>'status'))='active'
    and not (
      nullif(s.profile->>'suspendEffectiveDate','') is not null
      and (s.profile->>'suspendEffectiveDate')<=to_char(now() at time zone 'Asia/Bangkok','YYYY-MM-DD')
      and not (
        coalesce((s.profile->>'suspendAutoReactivate')::boolean,false)
        and nullif(s.profile->>'suspendEndDate','') is not null
        and (s.profile->>'suspendEndDate')<=to_char(now() at time zone 'Asia/Bangkok','YYYY-MM-DD')
      )
    )
    and (
      case when u.raw_app_meta_data->>'qa_auth_source'='qa-dashboard-migrated'
       then (select count(*) from qa_migration.sparks_profile_reconciliation_v1 d
             where lower(btrim(d.profile->>'username'))=lower(btrim(u.raw_app_meta_data->>'qa_username')))=1
       else (select count(*) from qa_migration.sparks_profile_reconciliation_v1 d
             where lower(btrim(d.profile->>'email'))=lower(btrim(u.email)))=1
      end
    )
  limit 1;
$function$;
