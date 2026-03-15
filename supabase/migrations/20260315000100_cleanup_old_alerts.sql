-- Migration: schedule daily cleanup of alerts older than 7 days
-- Creates a function `cleanup_old_alerts` and schedules it with pg_cron

begin;

-- ensure pg_cron is available
create extension if not exists pg_cron;

-- function to delete expired alerts
create or replace function public.cleanup_old_alerts()
returns void language sql stable as $$
  delete from alerts
  where end_at is not null
    and end_at < now() - interval '7 days';
$$;

-- schedule the job to run daily at 03:00 UTC if not already scheduled
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup_old_alerts') then
    perform cron.schedule('cleanup_old_alerts', '0 3 * * *', $cmd$select public.cleanup_old_alerts()$cmd$);
  end if;
end
$$;

commit;
