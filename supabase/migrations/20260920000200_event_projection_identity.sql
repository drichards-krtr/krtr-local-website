begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
create or replace function public.receive_nrcs_event(p_event jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved public.events; linked public.events; term uuid; target uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nrcs-event:'||(p_event->>'id'),0));
  select * into linked from public.events where nrcs_source_id=(p_event->>'id')::uuid for update;
  if linked.id is not null and linked.district_key<>p_event->>'district_key' then raise exception 'Event district identity conflict'; end if;
  if p_event->>'cms_event_id' is not null then
    if linked.id is not null and linked.id<>(p_event->>'cms_event_id')::uuid then raise exception 'CMS Event identity conflict'; end if;
    select * into linked from public.events where id=(p_event->>'cms_event_id')::uuid for update;
    if linked.id is null or linked.district_key<>p_event->>'district_key' then raise exception 'Linked CMS Event missing or belongs to another district'; end if;
    if linked.nrcs_source_id is not null and linked.nrcs_source_id<>(p_event->>'id')::uuid then raise exception 'CMS Event already linked to another NRCS Event'; end if;
  end if;
  target:=coalesce(linked.id,gen_random_uuid());
  insert into public.events(id,nrcs_source_id,district_key,title,description,body_html,location_name,address,city,state,zip,location,start_at,end_at,image_url,status,is_school_sports)
  values(target,(p_event->>'id')::uuid,p_event->>'district_key',p_event->>'title',p_event->>'description',p_event->>'body_html',p_event->>'location_name',p_event->>'address',p_event->>'city',p_event->>'state',p_event->>'zip',p_event->>'location',(p_event->>'start_at')::timestamp,nullif(p_event->>'end_at','')::timestamp,p_event->>'image_url',p_event->>'status',coalesce(p_event->'classification'->>'kind'='sport',false))
  on conflict(id) do update set nrcs_source_id=excluded.nrcs_source_id,district_key=excluded.district_key,title=excluded.title,description=excluded.description,body_html=excluded.body_html,location_name=excluded.location_name,address=excluded.address,city=excluded.city,state=excluded.state,zip=excluded.zip,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,image_url=excluded.image_url,status=excluded.status,is_school_sports=excluded.is_school_sports returning * into saved;
  delete from public.event_classification_assignments where event_id=saved.id;
  if p_event->'classification' is not null and p_event->'classification'<>'null'::jsonb then
    insert into public.event_classification_terms(district_key,kind,name,enabled) values(saved.district_key,(p_event->'classification'->>'kind')::public.event_classification_kind,p_event->'classification'->>'name',(p_event->'classification'->>'enabled')::boolean)
    on conflict(district_key,kind,name) do update set enabled=excluded.enabled returning id into term;
    insert into public.event_classification_assignments(event_id,term_id) values(saved.id,term);
  end if;
  return jsonb_build_object('id',saved.id,'nrcs_source_id',saved.nrcs_source_id,'district_key',saved.district_key,'status',saved.status);
end $$;
revoke all on function public.receive_nrcs_event(jsonb) from public,anon,authenticated;
grant execute on function public.receive_nrcs_event(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
