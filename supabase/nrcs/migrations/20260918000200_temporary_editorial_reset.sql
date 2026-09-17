begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';

-- Temporary pre-cutover capability. Drop this function before cutover.
create function public.nrcs_temporary_editorial_reset(p_confirmation text default null)
returns jsonb language plpgsql security definer set search_path = public
set lock_timeout = '5s' set statement_timeout = '30s'
as $$
declare
  tables text[] := array[
    'nrcs_publication_deliveries', 'nrcs_homepage_lineups', 'nrcs_priority_alerts',
    'nrcs_social_outputs', 'nrcs_web_output_media', 'nrcs_web_outputs',
    'nrcs_edition_assets', 'nrcs_rundown_items', 'nrcs_editions',
    'nrcs_follow_up_activity_logs', 'nrcs_follow_ups',
    'nrcs_story_wake_history', 'nrcs_story_wakes', 'nrcs_recent_items',
    'nrcs_intake_items', 'nrcs_review_flags', 'nrcs_story_assets',
    'nrcs_story_sources', 'nrcs_story_events', 'nrcs_related_stories',
    'nrcs_story_tags', 'nrcs_story_facts', 'nrcs_copy_versions',
    'nrcs_copy_streams', 'nrcs_stories', 'nrcs_events',
    'nrcs_source_documents', 'nrcs_sources', 'nrcs_assets'
  ];
  table_name text;
  predicate text;
  counts jsonb := '{}'::jsonb;
  row_count bigint;
begin
  if not public.nrcs_has_role('admin') then
    raise exception 'Active NRCS admin required' using errcode = '42501';
  end if;
  if p_confirmation is not null and p_confirmation <> 'DELETE ALL NRCS EDITORIAL CONTENT' then
    raise exception 'Confirmation does not match';
  end if;
  if p_confirmation is not null then
    -- Block writers during the transaction; fail promptly on contention.
    foreach table_name in array tables loop
      execute format('lock table public.%I in share row exclusive mode', table_name);
    end loop;
    lock table public.nrcs_school_identities in share mode;
  end if;
  foreach table_name in array tables loop
    predicate := '';
    if table_name = 'nrcs_assets' then
      -- School logos normally live on identities, not in the Asset library.
      -- Preserve matching library entries and the dedicated school namespace too.
      predicate := $p$ where not exists (
        select 1 from public.nrcs_school_identities s
        where s.logo_url = nrcs_assets.cloudinary_url
      ) and coalesce(cloudinary_public_id, '') not like 'krtr/schools/%' $p$;
    end if;
    execute format('select count(*) from public.%I%s', table_name, predicate) into row_count;
    counts := counts || jsonb_build_object(table_name, row_count);
    if p_confirmation is not null then
      execute format('delete from public.%I%s', table_name, predicate);
    end if;
  end loop;
  if p_confirmation is not null then
    insert into public.nrcs_permission_audit_events(actor_id, action, target_type, metadata)
    values(auth.uid(), 'temporary_editorial_reset', 'editorial_content', counts);
  end if;
  return counts;
end $$;
revoke all on function public.nrcs_temporary_editorial_reset(text) from public, anon;
grant execute on function public.nrcs_temporary_editorial_reset(text) to authenticated;
commit;
