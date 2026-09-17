begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';

create table public.nrcs_migration_runs (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key),
  mode text not null default 'dry_run' check(mode in ('dry_run','import','delta')),
  phase text not null default 'scan' check(phase in ('scan','ready','import','complete','cancelled')),
  kind_index integer not null default 0,
  cursor text,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  source_counts jsonb not null default '{}',
  source_audit jsonb not null default '{}',
  created_by uuid not null references public.nrcs_staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.nrcs_migration_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.nrcs_migration_runs(id) on delete cascade,
  kind text not null check(kind in ('tags','terms','stories','events','slots')),
  source_id text not null,
  source_hash text not null,
  raw jsonb not null,
  normalized jsonb not null,
  errors jsonb not null default '[]',
  warnings jsonb not null default '[]',
  status text not null default 'pending' check(status in ('pending','imported','unchanged','blocked','conflict','failed','removed')),
  detail text,
  unique(run_id,kind,source_id)
);
create table public.nrcs_migration_identities (
  id uuid not null unique default gen_random_uuid(),
  source_system text not null default 'cms',
  district_key text not null references public.nrcs_districts(district_key),
  kind text not null,
  source_id text not null,
  target_id uuid not null,
  source_hash text not null,
  target_hash text not null,
  provenance jsonb not null,
  mapping jsonb not null default '{}',
  imported_at timestamptz not null default now(),
  primary key(source_system,district_key,kind,source_id)
);
create index nrcs_migration_items_progress on public.nrcs_migration_items(run_id,status,kind,source_id);
create unique index nrcs_one_active_migration_per_district on public.nrcs_migration_runs(district_key) where phase in ('scan','import');
alter table public.nrcs_migration_runs enable row level security;
alter table public.nrcs_migration_items enable row level security;
alter table public.nrcs_migration_identities enable row level security;
create policy migration_runs_admin on public.nrcs_migration_runs for all
  using(public.nrcs_has_role('admin') and public.nrcs_can_access_district(district_key))
  with check(public.nrcs_has_role('admin') and public.nrcs_can_access_district(district_key));
create policy migration_items_admin on public.nrcs_migration_items for all
  using(public.nrcs_has_role('admin') and exists(select 1 from public.nrcs_migration_runs r where r.id=run_id and public.nrcs_can_access_district(r.district_key)))
  with check(public.nrcs_has_role('admin') and exists(select 1 from public.nrcs_migration_runs r where r.id=run_id and public.nrcs_can_access_district(r.district_key)));
create policy migration_identities_admin on public.nrcs_migration_identities for select
  using(public.nrcs_has_role('admin') and public.nrcs_can_access_district(district_key));

-- Conservative fingerprint includes all local Story content, including other outputs.
create function public.nrcs_migration_target_state(p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.nrcs_has_role('admin') then raise exception 'Admin required'; end if;
  if p_kind='stories' then
    select jsonb_build_object('story',to_jsonb(s),
      'facts',(select jsonb_agg(to_jsonb(x) order by x.id) from public.nrcs_story_facts x where x.story_id=s.id),
      'streams',(select jsonb_agg(to_jsonb(x) order by x.id) from public.nrcs_copy_streams x where x.story_id=s.id),
      'versions',(select jsonb_agg(to_jsonb(v) order by v.id) from public.nrcs_copy_versions v join public.nrcs_copy_streams x on x.id=v.stream_id where x.story_id=s.id),
      'tags',(select jsonb_agg(to_jsonb(x) order by x.tag_id) from public.nrcs_story_tags x where x.story_id=s.id),
      'assets',(select jsonb_agg(jsonb_build_object('link',to_jsonb(x),'asset',to_jsonb(a)) order by x.asset_id) from public.nrcs_story_assets x join public.nrcs_assets a on a.id=x.asset_id where x.story_id=s.id),
      'sources',(select jsonb_agg(to_jsonb(x) order by x.source_id) from public.nrcs_story_sources x where x.story_id=s.id),
      'events',(select jsonb_agg(to_jsonb(x) order by x.event_id) from public.nrcs_story_events x where x.story_id=s.id),
      'web',(select jsonb_agg(to_jsonb(x) order by x.id) from public.nrcs_web_outputs x where x.story_id=s.id),
      'web_media',(select jsonb_agg(to_jsonb(x) order by x.output_id,x.position) from public.nrcs_web_output_media x join public.nrcs_web_outputs o on o.id=x.output_id where o.story_id=s.id),
      'social',(select jsonb_agg(to_jsonb(x) order by x.id) from public.nrcs_social_outputs x where x.story_id=s.id)
      ,'intake',(select jsonb_agg(to_jsonb(x) order by x.id) from public.nrcs_intake_items x where x.source_system='cms_legacy_stories' and x.payload->>'converted_id'=s.id::text)
    ) into result from public.nrcs_stories s where s.id=p_id;
  elsif p_kind='events' then select jsonb_build_object('event',to_jsonb(x),'intake',(select jsonb_agg(to_jsonb(i) order by i.id) from public.nrcs_intake_items i where i.source_system='cms_legacy_events' and i.payload->>'converted_id'=x.id::text)) into result from public.nrcs_events x where x.id=p_id;
  elsif p_kind='terms' then select to_jsonb(x) into result from public.nrcs_event_classification_terms x where x.id=p_id;
  elsif p_kind='tags' then select to_jsonb(x) into result from public.nrcs_tags x where x.id=p_id;
  elsif p_kind='slots' then select to_jsonb(x) into result from public.nrcs_homepage_lineups x where x.district_key::text=(select district_key from public.nrcs_migration_identities where kind='slots' and target_id=p_id limit 1);
  end if;
  return result;
end $$;

create function public.nrcs_migration_claim(p_run uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.nrcs_migration_runs; token uuid:=gen_random_uuid();
begin
  select * into r from public.nrcs_migration_runs where id=p_run for update;
  if r.id is null or not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(r.district_key) then raise exception 'Migration admin access required'; end if;
  if r.lease_until>now() then raise exception 'Another batch is running; retry shortly'; end if;
  update public.nrcs_migration_runs set lease_token=token,lease_until=now()+interval '2 minutes',updated_at=now() where id=p_run;
  return token;
end $$;

create function public.nrcs_migration_assess(p_kind text,p_target uuid,p_baseline text,p_normalized jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare state jsonb; issues jsonb:='[]'; definition jsonb;
begin
  if not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(p_normalized->>'district_key') then raise exception 'Migration admin access required'; end if;
  state:=public.nrcs_migration_target_state(p_kind,p_target);
  if state is not null and (p_baseline is null or md5(state::text)<>p_baseline) then issues:=issues||jsonb_build_array('Existing NRCS target has local edits or no migration baseline.'); end if;
  if p_kind='stories' then
    if exists(select 1 from public.nrcs_web_outputs where cms_story_id=(p_normalized->>'id')::uuid and story_id<>p_target) then issues:=issues||jsonb_build_array('CMS Story already linked to another NRCS Story.'); end if;
    if exists(select 1 from public.nrcs_web_outputs where district_key=p_normalized->>'district_key' and slug=p_normalized->>'slug' and story_id<>p_target) then issues:=issues||jsonb_build_array('Public slug conflicts with another NRCS Story.'); end if;
    for definition in select value from jsonb_array_elements(coalesce(p_normalized->'tag_definitions','[]')) loop
      if exists(select 1 from public.nrcs_tags where slug=definition->>'slug' and lower(name)<>lower(definition->>'name'))
        or exists(select 1 from public.nrcs_tag_aliases a join public.nrcs_tags t on t.id=a.tag_id where lower(a.alias)=lower(definition->>'slug') and t.slug<>definition->>'slug') then
        issues:=issues||jsonb_build_array('Tag collision requires explicit mapping: '||(definition->>'slug'));
      end if;
    end loop;
  elsif p_kind='events' then
    if nullif(p_normalized->>'classification_target_id','') is not null and not exists(select 1 from public.nrcs_event_classification_terms where id=(p_normalized->>'classification_target_id')::uuid and district_key=p_normalized->>'district_key' and (not coalesce((p_normalized->>'is_school_sports')::boolean,false) or kind='sport')) then issues:=issues||jsonb_build_array('Manual classification does not belong to this district/kind.'); end if;
    if exists(select 1 from public.nrcs_events where cms_event_id=(p_normalized->>'id')::uuid and id<>p_target) then issues:=issues||jsonb_build_array('CMS Event already linked to another NRCS Event.'); end if;
  elsif p_kind='terms' then
    if exists(select 1 from public.nrcs_event_classification_terms where district_key=p_normalized->>'district_key' and kind::text=p_normalized->>'kind' and name=p_normalized->>'name' and enabled is distinct from (p_normalized->>'enabled')::boolean and (id<>p_target or p_baseline is null)) then issues:=issues||jsonb_build_array('Classification enabled state conflicts with NRCS.'); end if;
    if p_baseline is not null and exists(select 1 from public.nrcs_event_classification_terms where district_key=p_normalized->>'district_key' and kind::text=p_normalized->>'kind' and name=p_normalized->>'name' and id<>p_target) then issues:=issues||jsonb_build_array('Classification rename collides with another NRCS term.'); end if;
  elsif p_kind='tags' then
    if exists(select 1 from public.nrcs_tags where slug=p_normalized->>'slug' and lower(name)<>lower(p_normalized->>'name') and (id<>p_target or p_baseline is null))
      or exists(select 1 from public.nrcs_tag_aliases a join public.nrcs_tags t on t.id=a.tag_id where lower(a.alias)=lower(p_normalized->>'slug') and t.slug<>p_normalized->>'slug') then issues:=issues||jsonb_build_array('Canonical Tag/alias collision requires explicit mapping.'); end if;
  elsif p_kind='slots' and p_baseline is null and exists(select 1 from public.nrcs_homepage_lineups where district_key=p_normalized->>'district_key') then
    issues:=issues||jsonb_build_array('Existing NRCS Homepage lineup requires explicit reconciliation.');
  end if;
  return issues;
end $$;

create function public.nrcs_migration_report(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare district text; result jsonb;
begin
  select district_key into district from public.nrcs_migration_runs where id=p_run;
  if district is null or not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(district) then raise exception 'Migration admin access required'; end if;
  select jsonb_build_object('total',count(*),'issues',count(*) filter(where jsonb_array_length(errors)>0),
    'warnings',count(*) filter(where jsonb_array_length(warnings)>0),
    'statuses',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.nrcs_migration_items where run_id=p_run group by status) counts),
    'kinds',(select coalesce(jsonb_object_agg(kind,n),'{}') from (select kind,count(*) n from public.nrcs_migration_items where run_id=p_run and status<>'removed' group by kind) counts)
  ) into result from public.nrcs_migration_items where run_id=p_run;
  return result;
end $$;

-- Each item and its identity/status commit atomically. Network retries are safe.
create function public.nrcs_migration_apply(p_item uuid,p_token uuid) returns text
language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare
  item public.nrcs_migration_items;
  run public.nrcs_migration_runs;
  identity public.nrcs_migration_identities;
  n jsonb; current_state jsonb;
  target uuid; owner uuid; stream uuid; version uuid; output uuid;
  image uuid; video uuid; term uuid; tag uuid; contact jsonb; media jsonb;
  definition jsonb; existing public.nrcs_tags;
  sequence integer; slot_record record; tops uuid[]:='{}'; hero uuid; found_output uuid;
begin
  select * into item from public.nrcs_migration_items where id=p_item for update;
  select * into run from public.nrcs_migration_runs where id=item.run_id for update;
  if run.id is null or not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(run.district_key)
    or run.phase<>'import' or p_token is null or run.lease_until is null or run.lease_token is distinct from p_token or run.lease_until<now() then raise exception 'Active authorized migration lease required' using errcode='42501'; end if;
  if item.status<>'pending' then return item.status; end if;
  if jsonb_array_length(item.errors)>0 then update public.nrcs_migration_items set status='blocked',detail='Resolve dry-run exceptions and run a new dry run' where id=p_item; return 'blocked'; end if;
  n:=item.normalized;
  if n->>'district_key' is distinct from run.district_key then raise exception 'Source district mismatch'; end if;
  owner:=nullif(n->>'owner_id','')::uuid;
  select * into identity from public.nrcs_migration_identities where source_system='cms' and district_key=run.district_key and kind=item.kind and source_id=item.source_id for update;
  target:=coalesce(identity.target_id,(n->>'target_id')::uuid);
  current_state:=public.nrcs_migration_target_state(item.kind,target);
  if current_state is not null and identity.target_id is not null then
    if md5(current_state::text)<>identity.target_hash then
      update public.nrcs_migration_items set status='conflict',detail='NRCS target changed locally; not overwritten' where id=p_item; return 'conflict';
    end if;
    if identity.source_hash=item.source_hash and identity.mapping=coalesce(n->'mapping','{}') then update public.nrcs_migration_items set status='unchanged' where id=p_item; return 'unchanged'; end if;
  elsif current_state is not null then
    update public.nrcs_migration_items set status='conflict',detail='Existing NRCS record has no migration baseline; not overwritten' where id=p_item; return 'conflict';
  end if;

  if item.kind='tags' then
    select * into existing from public.nrcs_tags where slug=n->>'slug';
    if existing.id is not null then
      if lower(existing.name)<>lower(n->>'name') then
        if existing.id is distinct from identity.target_id then raise exception 'Canonical Tag name/slug collision'; end if;
        update public.nrcs_tags set name=n->>'name' where id=existing.id;
      end if;
      target:=existing.id;
    else
      if exists(select 1 from public.nrcs_tag_aliases where lower(alias)=lower(n->>'slug')) then raise exception 'Canonical Tag alias collision'; end if;
      insert into public.nrcs_tags(id,name,slug,tag_type) values(target,n->>'name',n->>'slug','other');
    end if;
  elsif item.kind='terms' then
    select id into term from public.nrcs_event_classification_terms where district_key=run.district_key and kind::text=n->>'kind' and name=n->>'name';
    if term is not null and term<>target then
      if identity.target_id is not null then raise exception 'Classification rename collides with another NRCS term'; end if;
      if exists(select 1 from public.nrcs_event_classification_terms where id=term and enabled is distinct from (n->>'enabled')::boolean) then raise exception 'Classification enabled state conflicts with NRCS'; end if;
      target:=term;
    else
      insert into public.nrcs_event_classification_terms(id,district_key,kind,name,enabled)
      values(target,run.district_key,(n->>'kind')::public.nrcs_event_classification_kind,n->>'name',(n->>'enabled')::boolean)
      on conflict(id) do update set kind=excluded.kind,name=excluded.name,enabled=excluded.enabled;
    end if;
  elsif item.kind='events' then
    if exists(select 1 from public.nrcs_events where cms_event_id=(n->>'id')::uuid and id<>target) then raise exception 'CMS Event already belongs to another NRCS record'; end if;
    term:=nullif(n->>'classification_target_id','')::uuid;
    if term is not null and not exists(select 1 from public.nrcs_event_classification_terms where id=term and district_key=run.district_key and (not coalesce((n->>'is_school_sports')::boolean,false) or kind='sport')) then raise exception 'Manual classification district/kind mismatch'; end if;
    if term is null and n->'classification' is not null and n->'classification'<>'null'::jsonb then
      select target_id into term from public.nrcs_migration_identities where district_key=run.district_key and kind='terms' and source_id=n->'classification'->>'id';
      if term is null then raise exception 'Classification term was not imported'; end if;
    end if;
    insert into public.nrcs_events(id,district_key,title,body_html,location_name,address,city,state,zip,location,start_at,end_at,image_url,status,classification_term_id,cms_event_id,created_by,created_at,updated_at)
    values(target,run.district_key,n->>'title',n->>'body_html',coalesce(n->>'location_name',''),coalesce(n->>'address',''),coalesce(n->>'city',''),coalesce(n->>'state',''),coalesce(n->>'zip',''),n->>'location',(n->>'start_at')::timestamp,nullif(n->>'end_at','')::timestamp,n->>'image_url',(n->>'status')::public.nrcs_event_status,term,(n->>'id')::uuid,owner,(n->>'created_at')::timestamptz,(n->>'updated_at')::timestamptz)
    on conflict(id) do update set title=excluded.title,body_html=excluded.body_html,location_name=excluded.location_name,address=excluded.address,city=excluded.city,state=excluded.state,zip=excluded.zip,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,image_url=excluded.image_url,status=excluded.status,classification_term_id=excluded.classification_term_id,created_by=excluded.created_by,updated_at=excluded.updated_at;
  elsif item.kind='stories' then
    if exists(select 1 from public.nrcs_web_outputs where cms_story_id=(n->>'id')::uuid and story_id<>target) then raise exception 'CMS Story already belongs to another NRCS Story'; end if;
    insert into public.nrcs_stories(id,district_key,title,lifecycle_state,created_by,created_at,updated_at)
    values(target,run.district_key,n->>'title',(n->>'lifecycle_state')::public.nrcs_story_lifecycle_state,owner,(n->>'created_at')::timestamptz,(n->>'updated_at')::timestamptz)
    on conflict(id) do update set title=excluded.title,lifecycle_state=excluded.lifecycle_state,created_by=excluded.created_by,updated_at=excluded.updated_at;
    insert into public.nrcs_copy_streams(story_id,stream_type,created_at) values(target,'web',(n->>'created_at')::timestamptz)
    on conflict(story_id,stream_type) do nothing;
    select id,current_version_id into stream,version from public.nrcs_copy_streams where story_id=target and stream_type='web';
    if version is null or not exists(select 1 from public.nrcs_copy_versions where id=version and headline is not distinct from n->>'title' and body_html=n->>'body_html') then
      select coalesce(max(version_number),0)+1 into sequence from public.nrcs_copy_versions where stream_id=stream;
      insert into public.nrcs_copy_versions(stream_id,version_number,headline,body_html,created_by,created_at)
      values(stream,sequence,n->>'title',n->>'body_html',owner,case when sequence=1 then (n->>'updated_at')::timestamptz else now() end) returning id into version;
      update public.nrcs_copy_streams set current_version_id=version where id=stream;
    end if;
    image:=null; video:=null;
    if nullif(n->>'image_url','') is not null then
      select id into image from public.nrcs_assets where asset_type in ('image','graphic') and (cloudinary_url=n->>'image_url' or nullif(n->>'image_public_id','') is not null and cloudinary_public_id=n->>'image_public_id') order by created_at,id limit 1;
      if image is null then
        insert into public.nrcs_assets(asset_type,title,cloudinary_url,cloudinary_public_id,created_by,created_at,metadata)
        values('image',n->>'title',n->>'image_url',n->>'image_public_id',owner,(n->>'created_at')::timestamptz,jsonb_build_object('width',n->'image_width','height',n->'image_height','legacy_source','cms','legacy_source_id',item.source_id)) returning id into image;
      end if;
      insert into public.nrcs_story_assets(story_id,asset_id,relationship) values(target,image,'hero') on conflict(story_id,asset_id) do nothing;
    end if;
    if nullif(n->>'mux_asset_id','') is not null then
      -- A Story author is not proof of upload ownership. Never grant a contributor
      -- access to legacy library videos by guessing who uploaded them.
      select id into video from public.nrcs_assets where asset_type='video' and mux_asset_id=n->>'mux_asset_id' and created_by is null and district_key=run.district_key order by created_at,id limit 1;
      if video is null then
        insert into public.nrcs_assets(asset_type,title,district_key,mux_asset_id,mux_playback_id,mux_upload_id,mux_status,thumbnail_url,created_by,created_at,metadata)
        values('video',n->>'title',run.district_key,n->>'mux_asset_id',n->>'mux_playback_id',n->>'mux_upload_id',n->>'mux_status','https://image.mux.com/'||(n->>'mux_playback_id')||'/thumbnail.jpg',null,(n->>'created_at')::timestamptz,jsonb_build_object('video_orientation',n->>'video_orientation','legacy_source','cms','legacy_source_id',item.source_id)) returning id into video;
      end if;
      insert into public.nrcs_story_assets(story_id,asset_id,relationship) values(target,video,'supporting') on conflict(story_id,asset_id) do nothing;
    end if;
    delete from public.nrcs_story_tags where story_id=target;
    for definition in select value from jsonb_array_elements(coalesce(n->'tag_definitions','[]')) loop
      select * into existing from public.nrcs_tags where slug=definition->>'slug';
      if existing.id is not null and lower(existing.name)<>lower(definition->>'name') then raise exception 'Tag name/slug collision: %',definition->>'slug'; end if;
      if exists(select 1 from public.nrcs_tag_aliases where alias=definition->>'slug' and tag_id is distinct from existing.id) then raise exception 'Tag alias collision'; end if;
      if existing.id is null then
        insert into public.nrcs_tags(name,slug,tag_type) values(definition->>'name',definition->>'slug','other') returning id into tag;
      else tag:=existing.id; end if;
      insert into public.nrcs_story_tags(story_id,tag_id) values(target,tag);
    end loop;
    select id into output from public.nrcs_web_outputs where story_id=target;
    update public.nrcs_story_assets set relationship='supporting' where story_id=target and relationship='hero' and asset_id is distinct from image;
    if output is not null then delete from public.nrcs_web_output_media where output_id=output; end if;
    insert into public.nrcs_web_outputs(story_id,district_key,copy_version_id,status,slug,hero_asset_id,video_asset_id,tease,scheduled_at,published_at,cms_story_id,created_at)
    values(target,run.district_key,version,(n->>'output_status')::public.nrcs_web_output_status,n->>'slug',image,video,n->>'tease',case when n->>'output_status'='scheduled' then (n->>'published_at')::timestamptz end,case when n->>'output_status'<>'scheduled' then (n->>'published_at')::timestamptz end,(n->>'id')::uuid,(n->>'created_at')::timestamptz)
    on conflict(story_id) do update set copy_version_id=excluded.copy_version_id,status=excluded.status,slug=excluded.slug,hero_asset_id=excluded.hero_asset_id,video_asset_id=excluded.video_asset_id,tease=excluded.tease,scheduled_at=excluded.scheduled_at,published_at=excluded.published_at returning id into output;
    if image is not null then insert into public.nrcs_web_output_media(output_id,asset_id,position) values(output,image,0); end if;
  elsif item.kind='slots' then
    -- All five slots form one unit; importing a partial lineup is never allowed.
    if exists(select 1 from public.nrcs_migration_items where run_id=run.id and kind='slots' and jsonb_array_length(errors)>0) then raise exception 'Homepage placement has unresolved exceptions'; end if;
    for slot_record in select value as raw from jsonb_array_elements(n->'slots') order by value->>'slot' loop
      found_output:=null;
      if nullif(slot_record.raw->>'story_id','') is not null then
        select o.id into found_output from public.nrcs_web_outputs o join public.nrcs_migration_identities m on m.target_id=o.story_id and m.kind='stories' and m.district_key=run.district_key where m.source_id=slot_record.raw->>'story_id';
        if found_output is null then raise exception 'Homepage references a Story that was not imported'; end if;
      end if;
      if slot_record.raw->>'slot'='hero' then hero:=found_output;
      elsif found_output is not null then tops:=array_append(tops,found_output); end if;
    end loop;
    if identity.target_id is null and exists(select 1 from public.nrcs_homepage_lineups where district_key=run.district_key) then raise exception 'Existing NRCS Homepage lineup requires explicit reconciliation'; end if;
    insert into public.nrcs_homepage_lineups(district_key,hero_output_id,top_output_ids) values(run.district_key,hero,tops)
    on conflict(district_key) do update set hero_output_id=excluded.hero_output_id,top_output_ids=excluded.top_output_ids;
  end if;

  -- Imported public submissions are already converted, not actionable duplicate tips.
  if item.kind in ('stories','events') then
    for contact in select value from jsonb_array_elements(coalesce(n->'submitters','[]')) loop
      if exists(select 1 from public.nrcs_intake_items where source_system='cms_legacy_'||item.kind and external_source_id=contact->>'id' and (district_key<>run.district_key or payload->>'converted_id' is distinct from target::text)) then raise exception 'Legacy submission already associated with a different editorial record'; end if;
      insert into public.nrcs_intake_items(intake_type,district_key,status,title,body,submitter_name,submitter_email,submitter_phone,payload,source_system,external_source_id,created_at)
      values(case when item.kind='stories' then 'story_tip'::public.nrcs_intake_type else 'calendar_submission'::public.nrcs_intake_type end,run.district_key,'converted',n->>'title',coalesce(n->>'body_markdown',n->>'description'),contact->>'name',contact->>'email',contact->>'phone',jsonb_build_object('legacy_source','cms','legacy_source_id',item.source_id,'converted_kind',item.kind,'converted_id',target,'legacy_contact',contact),'cms_legacy_'||item.kind,contact->>'id',coalesce((contact->>'created_at')::timestamptz,(n->>'created_at')::timestamptz))
      on conflict(source_system,external_source_id) do update set title=excluded.title,body=excluded.body,submitter_name=excluded.submitter_name,submitter_email=excluded.submitter_email,submitter_phone=excluded.submitter_phone,payload=excluded.payload;
    end loop;
  end if;
  insert into public.nrcs_migration_identities(district_key,kind,source_id,target_id,source_hash,target_hash,provenance,mapping)
  values(run.district_key,item.kind,item.source_id,target,item.source_hash,'pending',item.raw,coalesce(n->'mapping','{}'))
  on conflict(source_system,district_key,kind,source_id) do update set target_id=excluded.target_id,source_hash=excluded.source_hash,provenance=excluded.provenance,mapping=excluded.mapping,imported_at=now();
  current_state:=public.nrcs_migration_target_state(item.kind,target);
  update public.nrcs_migration_identities set target_hash=md5(current_state::text) where source_system='cms' and district_key=run.district_key and kind=item.kind and source_id=item.source_id;
  update public.nrcs_migration_items set status='imported',detail=null where id=p_item;
  return 'imported';
exception when insufficient_privilege then raise;
when others then
  -- PL/pgSQL exception block rolls back every editorial write for this item.
  update public.nrcs_migration_items set status='failed',detail=sqlerrm where id=p_item;
  return 'failed';
end $$;

revoke all on function public.nrcs_migration_target_state(text,uuid),public.nrcs_migration_claim(uuid),public.nrcs_migration_apply(uuid,uuid) from public,anon;
grant execute on function public.nrcs_migration_target_state(text,uuid),public.nrcs_migration_claim(uuid),public.nrcs_migration_apply(uuid,uuid) to authenticated;
revoke all on function public.nrcs_migration_assess(text,uuid,text,jsonb),public.nrcs_migration_report(uuid) from public,anon;
grant execute on function public.nrcs_migration_assess(text,uuid,text,jsonb),public.nrcs_migration_report(uuid) to authenticated;
grant select,insert,update,delete on public.nrcs_migration_runs,public.nrcs_migration_items to authenticated;
grant select on public.nrcs_migration_identities to authenticated;
revoke all on public.nrcs_migration_runs,public.nrcs_migration_items,public.nrcs_migration_identities from anon;
commit;
