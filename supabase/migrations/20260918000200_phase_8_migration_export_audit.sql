begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Read-only inventory. No editorial tables, policies or routes are changed.
create function public.nrcs_legacy_migration_audit() returns jsonb
language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'unassigned_story_submitters',(select count(*) from public.story_submitters c where not exists(select 1 from public.stories s where s.id=c.submitted_story_id or s.submitter_id=c.id)),
    'unassigned_event_submitters',(select count(*) from public.event_submitters c where not exists(select 1 from public.events e where e.id=c.submitted_event_id or e.submitter_id=c.id)),
    'unmapped_story_districts',(select count(*) from public.stories s where not exists(select 1 from public.districts d where d.district_key=s.district_key)),
    'unmapped_event_districts',(select count(*) from public.events e where not exists(select 1 from public.districts d where d.district_key=e.district_key))
  );
$$;
revoke all on function public.nrcs_legacy_migration_audit() from public,anon,authenticated;
grant execute on function public.nrcs_legacy_migration_audit() to service_role;
commit;
