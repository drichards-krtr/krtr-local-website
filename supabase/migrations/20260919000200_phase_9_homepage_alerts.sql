begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

alter table public.story_slots add column nrcs_managed boolean not null default false;
alter table public.story_slots add column nrcs_daily_id uuid references public.dailys(id);
alter table public.story_slots add column nrcs_revision integer;
alter table public.dailys add column nrcs_edition_id uuid;
alter table public.dailys add column nrcs_publication_date date;
alter table public.dailys add column nrcs_timezone text;
create unique index dailys_nrcs_edition_date on public.dailys(district_key,nrcs_edition_id,nrcs_publication_date);
alter table public.alerts add column nrcs_source_id uuid unique;
alter table public.alerts add column nrcs_revision integer;
alter table public.alerts add column headline text;
alter table public.alerts add column nrcs_target_type text;
alter table public.alerts add column nrcs_target_id uuid;

-- Retain legacy window semantics; NRCS instants are stored as naive UTC.
drop policy if exists "Alerts public read active window" on public.alerts;
create policy "Alerts public read active window" on public.alerts for select using(active and
  (start_at is null or start_at<=now() at time zone 'UTC') and
  (end_at is null or case when nrcs_source_id is null then end_at>=now() at time zone 'UTC' else end_at>now() at time zone 'UTC' end));

create function public.receive_nrcs_homepage_publication(p_package jsonb,p_hash text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare receipt jsonb; projection public.nrcs_publication_projections; p jsonb;
  output_id uuid; article_id uuid; hero_id uuid; tops uuid[]:='{}'; daily_id uuid;
  daily jsonb; media jsonb; zone text; index integer; utc_midnight timestamp;
begin
  if p_package->>'kind'<>'homepage' then raise exception 'Homepage package required'; end if;
  receipt:=public.receive_nrcs_publication(p_package,p_hash);
  select * into projection from public.nrcs_publication_projections where id=(receipt->>'cms_projection_id')::uuid for update;
  if projection.revision<>(p_package->>'revision')::integer then return receipt; end if;
  p:=projection.package->'payload';
  if p->>'hero_output_id' is not null then
    select id into hero_id from public.stories where district_key=projection.district_key and nrcs_output_id=(p->>'hero_output_id')::uuid for key share;
    if hero_id is null then raise exception 'Hero Web Output must be delivered to CMS first'; end if;
  end if;
  for output_id in select value::text::uuid from jsonb_array_elements_text(p->'top_output_ids') loop
    select id into article_id from public.stories where district_key=projection.district_key and nrcs_output_id=output_id for key share;
    if article_id is null then raise exception 'Top Four Web Output must be delivered to CMS first'; end if;
    tops:=array_append(tops,article_id);
  end loop;
  daily:=p->'daily';
  if daily is not null and daily<>'null'::jsonb then
    select timezone into zone from public.districts where district_key=projection.district_key;
    if zone is distinct from p->>'timezone' then raise exception 'District timezone changed; refresh NRCS configuration and resend'; end if;
    -- Midnight-to-midnight in the district, including 23/25-hour DST days.
    utc_midnight:=((daily->>'publication_date')::date::timestamp at time zone zone) at time zone 'UTC';
    media:=daily->'asset';
    insert into public.dailys(district_key,title,status,published_at,slug,image_url,cloudinary_public_id,mux_asset_id,mux_playback_id,mux_status,video_orientation,nrcs_edition_id,nrcs_publication_date,nrcs_timezone)
    values(projection.district_key,daily->>'title','published',utc_midnight,'nrcs-daily-'||(daily->>'edition_id')||'-'||(daily->>'publication_date'),
      case when media->>'asset_type'='video' then media->>'thumbnail_url' else media->>'url' end,media->>'public_id',media->>'mux_asset_id',media->>'playback_id',case when media->>'asset_type'='video' then 'ready' else null end,coalesce(media->>'orientation','horizontal'),(daily->>'edition_id')::uuid,(daily->>'publication_date')::date,zone)
    on conflict(district_key,nrcs_edition_id,nrcs_publication_date) do update set title=excluded.title,image_url=excluded.image_url,cloudinary_public_id=excluded.cloudinary_public_id,mux_asset_id=excluded.mux_asset_id,mux_playback_id=excluded.mux_playback_id,mux_status=excluded.mux_status,video_orientation=excluded.video_orientation,published_at=excluded.published_at,nrcs_timezone=excluded.nrcs_timezone,status='published' returning id into daily_id;
  end if;
  insert into public.story_slots(district_key,slot,story_id,nrcs_managed,nrcs_daily_id,nrcs_revision)
  values(projection.district_key,'hero',hero_id,true,daily_id,projection.revision)
  on conflict(district_key,slot) do update set story_id=excluded.story_id,nrcs_managed=true,nrcs_daily_id=excluded.nrcs_daily_id,nrcs_revision=excluded.nrcs_revision;
  for index in 1..4 loop
    insert into public.story_slots(district_key,slot,story_id,nrcs_managed,nrcs_revision)
    values(projection.district_key,'top'||index,tops[index],true,projection.revision)
    on conflict(district_key,slot) do update set story_id=excluded.story_id,nrcs_managed=true,nrcs_revision=excluded.nrcs_revision;
  end loop;
  return receipt||jsonb_build_object('state','applied','public_url','/');
end $$;

create function public.receive_nrcs_alert_publication(p_package jsonb,p_hash text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare receipt jsonb; projection public.nrcs_publication_projections; p jsonb; target uuid;
begin
  if p_package->>'kind'<>'alert' then raise exception 'Alert package required'; end if;
  receipt:=public.receive_nrcs_publication(p_package,p_hash);
  select * into projection from public.nrcs_publication_projections where id=(receipt->>'cms_projection_id')::uuid for update;
  if projection.revision<>(p_package->>'revision')::integer then return receipt; end if;
  p:=projection.package->'payload';
  -- Serialize district alerts so simultaneous deliveries cannot create overlaps.
  perform pg_advisory_xact_lock(hashtextextended('nrcs-alert-district:'||projection.district_key,0));
  if (p->>'active')::boolean and exists(select 1 from public.alerts where district_key=projection.district_key and nrcs_source_id is not null and nrcs_source_id<>(p_package->>'source_id')::uuid and active and
    tsrange(start_at,end_at,'[)') && tsrange((p->>'start_at')::timestamptz at time zone 'UTC',(p->>'end_at')::timestamptz at time zone 'UTC','[)')) then raise exception 'Priority Alert schedule conflict'; end if;
  if p->>'target_type'='story' then
    select id into target from public.stories where district_key=projection.district_key and nrcs_story_id=(p->>'target_id')::uuid;
    if target is null then raise exception 'Alert Story must be delivered to CMS first'; end if;
  elsif p->>'target_type'='event' then
    select id into target from public.events where district_key=projection.district_key and nrcs_source_id=(p->>'target_id')::uuid;
    if target is null then raise exception 'Alert Event must be delivered to CMS first'; end if;
  end if;
  insert into public.alerts(district_key,nrcs_source_id,nrcs_revision,headline,message,active,start_at,end_at,link_url,nrcs_target_type,nrcs_target_id)
  values(projection.district_key,(p_package->>'source_id')::uuid,projection.revision,p->>'headline',p->>'message',(p->>'active')::boolean,(p->>'start_at')::timestamptz at time zone 'UTC',(p->>'end_at')::timestamptz at time zone 'UTC',p->>'external_url',p->>'target_type',target)
  on conflict(nrcs_source_id) do update set nrcs_revision=excluded.nrcs_revision,headline=excluded.headline,message=excluded.message,active=excluded.active,start_at=excluded.start_at,end_at=excluded.end_at,link_url=excluded.link_url,nrcs_target_type=excluded.nrcs_target_type,nrcs_target_id=excluded.nrcs_target_id;
  -- Never modify story_slots: the normal Hero returns when this alert expires.
  return receipt||jsonb_build_object('state','applied','public_url','/');
end $$;
revoke all on function public.receive_nrcs_homepage_publication(jsonb,text),public.receive_nrcs_alert_publication(jsonb,text) from public,anon,authenticated;
grant execute on function public.receive_nrcs_homepage_publication(jsonb,text),public.receive_nrcs_alert_publication(jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
