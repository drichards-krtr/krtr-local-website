-- TARGET: CMS Supabase database. Apply before deploying the CMS receiving route.
-- Unpublished NRCS Events do not need a public projection. Existing projections are hidden.
begin;
create or replace function public.hide_nrcs_event(p_id uuid,p_district text,p_status text,p_cms_event_id uuid default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare saved public.events;
begin
  if p_status not in ('draft','archived') then raise exception 'Invalid hidden Event status'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nrcs-event:'||p_id::text,0));
  select * into saved from events where nrcs_source_id=p_id for update;
  if p_cms_event_id is not null then
    if saved.id is not null and saved.id<>p_cms_event_id then raise exception 'CMS Event identity conflict'; end if;
    select * into saved from events where id=p_cms_event_id for update;
    if saved.id is null or saved.district_key<>p_district then raise exception 'Linked CMS Event missing or belongs to another district'; end if;
    if saved.nrcs_source_id is not null and saved.nrcs_source_id<>p_id then raise exception 'CMS Event already linked to another NRCS Event'; end if;
  end if;
  if saved.id is not null then
    if saved.district_key<>p_district then raise exception 'Event district identity conflict'; end if;
    update events set status=p_status,nrcs_source_id=p_id where id=saved.id returning * into saved;
  end if;
  return jsonb_build_object('id',saved.id,'nrcs_source_id',p_id,'district_key',p_district,'status',p_status);
end $$;
revoke all on function public.hide_nrcs_event(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.hide_nrcs_event(uuid,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
