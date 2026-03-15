-- Migration: schedule daily cleanup of logos expired more than 30 days ago
-- Creates a function `cleanup_expired_logos` and schedules it with pg_cron

begin;

create extension if not exists pg_cron;

create or replace function public.cleanup_expired_logos()
returns void
language sql
as $$
  delete from logos
  where is_default = false
    and end_date < current_date - interval '30 days';
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup_expired_logos') then
    perform cron.schedule(
      'cleanup_expired_logos',
      '15 3 * * *',
      $cmd$select public.cleanup_expired_logos()$cmd$
    );
  end if;
end
$$;

commit;
