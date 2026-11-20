-- After applying maintenance-compensation-v1.sql on the authorized QA Sparks project.
-- Idempotent reapply updates the same named task; pg_cron runs as the creating
-- database role. No user-facing API secret or Firestore query is involved.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('qa-sparks-maintenance-compensation','*/5 * * * *',
  $$SELECT sparks_runtime.maintenance_process();$$);
-- Verify:
-- SELECT jobid,jobname,active,schedule FROM cron.job
-- WHERE jobname='qa-sparks-maintenance-compensation';
