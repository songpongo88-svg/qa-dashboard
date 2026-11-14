-- SNAPSHOT-BASED MANUAL ROLLBACK — QA Core anon/authenticated table grants.
-- Prepared 14 Nov 2026 from the LIVE Supabase project vyhleszztvchevncgkhd.
-- NOT AUTOMATIC. DO NOT RUN UNLESS A REVIEWED CUTOVER FAILS.
--
-- Direct ACL snapshot for EACH table below:
-- {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,
--  authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- (all table privileges, no grant option). RLS was enabled on all six.
-- The companion lockdown ONLY revokes privileges, not RLS policies.
-- This script therefore restores direct table ACL to its pre-cutover state,
-- but does NOT restore any unrelated future RLS policies, RPC privileges,
-- service credentials, or other objects.
--
-- Before use: re-run supabase-client-access-audit.sql; compare live ACLs
-- to the snapshot. Reconfirm the outage's cause and validate the impact
-- of re-exposing QA evaluations/profiles and system settings. Take a new
-- ACL/policy snapshot if anything has changed since 14 November.
--
-- Run this body INSIDE ONE explicit PostgreSQL transaction started by the
-- release operator after independent approval:
--   BEGIN;
--   SELECT set_config('qa.single_session_acl_rollback_approval',
--                     'qa-core-rollback-reviewed-20261114', true);
--   [execute the DO, GRANT and verification body below]
--   COMMIT;
-- Do not wrap an extra BEGIN/COMMIT around this file body.

DO $qa_acl_rollback_guard$
BEGIN
  IF current_setting('qa.single_session_acl_rollback_approval', true)
      IS DISTINCT FROM 'qa-core-rollback-reviewed-20261114' THEN
    RAISE EXCEPTION 'QA Core ACL rollback not approved; do not re-expose sensitive data';
  END IF;
END
$qa_acl_rollback_guard$;

GRANT ALL PRIVILEGES ON TABLE
  public.qa_evaluations,
  public.qa_role_definitions,
  public.qa_role_permissions,
  public.qa_system_settings,
  public.qa_user_profiles,
  public.usage_logs
TO anon, authenticated;

DO $qa_acl_rollback_verify$
DECLARE
  t text;
  privilege_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'qa_evaluations', 'qa_role_definitions', 'qa_role_permissions',
    'qa_system_settings', 'qa_user_profiles', 'usage_logs'
  ] LOOP
    -- has_table_privilege with a comma-separated list checks ANY right,
    -- not ALL rights. Verify each of the 8 privileges separately.
    FOREACH privilege_name IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
      'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ] LOOP
      IF NOT has_table_privilege('anon', 'public.' || t, privilege_name)
         OR NOT has_table_privilege('authenticated', 'public.' || t, privilege_name) THEN
        RAISE EXCEPTION 'QA Core ACL rollback failed for %, privilege %',
          t, privilege_name;
      END IF;
    END LOOP;
  END LOOP;
END
$qa_acl_rollback_verify$;
-- This is an emergency restoration, not a secure permanent release.
-- Once recovered, reapply a reviewed cutover and verify denied Data API calls.
