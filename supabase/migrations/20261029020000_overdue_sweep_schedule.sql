-- Nightly overdue sweep on the database's own scheduler (pg_cron), so overdue
-- statuses and collection tasks are current even when nobody opens Accounts or
-- Sales. Runs at 01:00 IST (19:30 UTC). Uses no Vercel cron or function time.
-- Idempotent: re-running replaces the job.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron could not be enabled (%); overdue status still refreshes when Accounts or Sales pages load.', SQLERRM;
    RETURN;
  END;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'receivables-overdue-sweep';
  PERFORM cron.schedule('receivables-overdue-sweep', '30 19 * * *',
                        'SELECT public.mark_overdue_receivables(); SELECT public.refresh_collection_tasks();');
END $$;

-- Verification:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'receivables-overdue-sweep';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'receivables-overdue-sweep')
--    ORDER BY start_time DESC LIMIT 5;
