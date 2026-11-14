-- QA Dashboard — Single Active Session security gate.
-- MANUAL CUTOVER ONLY. NOT AUTO-DEPLOYED. Requires verified server-only
-- QA Core writes and a tested rollback before executing on production.
-- The current Supabase public QA Core tables expose permissive TO anon
-- policies (USING true / WITH CHECK true). RLS alone is NOT a barrier.
--
-- This denies all direct anon/authenticated Data API table access while
-- preserving service_role/server-side credentials. Do not apply until
-- every direct browser dependency and QA failover path has moved behind a
-- server that independently verifies active session ID and authorization.
-- public.qa_sparks_access_control is deliberately excluded; it exposes
-- the public read-only enabled state and uses owner-verified updates.
--
-- Release operator must approve this transaction explicitly in the SAME
-- transaction, e.g.:
-- BEGIN;
-- SELECT set_config('qa.single_session_cutover_approval',
--   'qa-core-client-lockdown-reviewed-20261114', true);
-- [run the guarded DO and REVOKE statements, omitting the outer BEGIN/COMMIT]
-- COMMIT;
--
-- IMPORTANT: No automatic rollback GRANT is provided: restore the exact
-- pre-cutover ACL and RLS policy backup from the change-control record.

BEGIN;
DO $security_release_gate$
BEGIN
  IF current_setting('qa.single_session_cutover_approval', true)
    IS DISTINCT FROM 'qa-core-client-lockdown-reviewed-20261114' THEN
    RAISE EXCEPTION 'QA Core ACL cutover not approved; inspect browser callers, export existing ACLs, test rollback first';
  END IF;
END
$security_release_gate$;

REVOKE ALL PRIVILEGES ON TABLE
  public.qa_evaluations,
  public.qa_role_definitions,
  public.qa_role_permissions,
  public.qa_system_settings,
  public.qa_user_profiles,
  public.usage_logs
FROM PUBLIC, anon, authenticated;

COMMIT;
