-- Read-only pre-cutover checks for the QA auth/T&C migration.
-- A zero-row shadow does NOT mean completed migration.
SELECT
 (SELECT count(*) FROM auth.users) AS supabase_auth_users,
 (SELECT count(*) FROM public.qa_user_profiles) AS qa_profiles,
 (SELECT count(*) FROM qa_migration.session_shadow) AS staged_sessions,
 (SELECT count(*) FROM qa_migration.session_revocation_shadow) AS staged_revocations,
 (SELECT count(*) FROM qa_migration.terms_acceptances) AS staged_terms,
 (SELECT count(*) FROM qa_migration.identity_reconciliation WHERE NOT matched) AS identity_mismatches,
 (SELECT count(*) FROM qa_migration.terms_reconciliation WHERE NOT matched) AS terms_mismatches;
-- Reject cutover if either complete source census is absent or any row does not match.
-- Also independently compare historical acceptance signatures, exact T&C version,
-- hash, acceptedAt timestamp, user permissions, suspended status and revocations.
-- Revalidate actual login + logout + admin revocation through production-like preview.
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='qa_migration' AND c.relkind='r'
ORDER BY c.relname;
