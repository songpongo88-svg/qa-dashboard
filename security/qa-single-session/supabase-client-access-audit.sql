-- READ-ONLY release audit. Never changes privileges or application data.
-- Sensitive QA Core tables must not have anonymous client permissions
-- when Single Active Session is enabled; verify every public owner RPC.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND c.relname IN ('qa_evaluations','qa_user_profiles','qa_role_definitions',
    'qa_role_permissions','qa_system_settings','usage_logs','qa_sparks_access_control')
ORDER BY c.relname;

SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename IN
('qa_evaluations','qa_user_profiles','qa_role_definitions',
 'qa_role_permissions','qa_system_settings','usage_logs','qa_sparks_access_control')
ORDER BY tablename, policyname;

SELECT n.nspname, p.proname, p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND
  (p.proname LIKE 'sparks_%' OR p.proname LIKE 'qa_%')
ORDER BY p.proname;

-- Release readiness: returns BLOCKED_DIRECT_CLIENT if *any* six QA Core
-- table still permits SELECT, INSERT, UPDATE or DELETE for anon/authenticated.
-- This is a grant-only check; SECURITY DEFINER RPCs need separate review.
WITH target(table_name) AS (
  VALUES ('qa_evaluations'),('qa_user_profiles'),('qa_role_definitions'),
         ('qa_role_permissions'),('qa_system_settings'),('usage_logs')
)
SELECT t.table_name,
       c.oid IS NOT NULL AS exists_in_public,
       c.relrowsecurity AS rls_enabled,
       CASE WHEN c.oid IS NULL THEN 'BLOCKED_MISSING_TABLE'
            WHEN NOT c.relrowsecurity THEN 'BLOCKED_RLS_DISABLED'
            WHEN has_table_privilege('anon',c.oid,'SELECT') OR
                 has_table_privilege('anon',c.oid,'INSERT') OR
                 has_table_privilege('anon',c.oid,'UPDATE') OR
                 has_table_privilege('anon',c.oid,'DELETE') OR
                 has_table_privilege('authenticated',c.oid,'SELECT') OR
                 has_table_privilege('authenticated',c.oid,'INSERT') OR
                 has_table_privilege('authenticated',c.oid,'UPDATE') OR
                 has_table_privilege('authenticated',c.oid,'DELETE')
                 THEN 'BLOCKED_DIRECT_CLIENT'
            ELSE 'GRANTS_LOCKED_DOWN'
       END AS release_status
FROM target t LEFT JOIN pg_class c ON c.relname=t.table_name
  AND c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
ORDER BY t.table_name;
