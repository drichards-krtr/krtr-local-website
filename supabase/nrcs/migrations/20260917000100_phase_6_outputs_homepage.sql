begin;

-- Stop rather than discard any pre-existing duplicate output records.
do $$ begin
  if exists (select story_id from public.nrcs_web_outputs group by story_id having count(*) > 1) then
    raise exception 'Multiple Web Outputs exist for a Story. Resolve duplicates before applying Phase 6.';
  end if;
end $$;
alter table public.nrcs_web_outputs add column if not exists district_key text references public.nrcs_districts(district_key);
update public.nrcs_web_outputs o set district_key=s.district_key from public.nrcs_stories s where s.id=o.story_id and o.district_key is null;
alter table public.nrcs_web_outputs alter column district_key set not null;
alter table public.nrcs_web_outputs add column if not exists revision integer not null default 0;
create unique index if not exists nrcs_one_web_output_per_story on public.nrcs_web_outputs(story_id);
create unique index if not exists nrcs_web_output_district_slug on public.nrcs_web_outputs(district_key,slug) where slug is not null;

create table public.nrcs_web_output_media (
  output_id uuid not null references public.nrcs_web_outputs(id) on delete cascade,
  asset_id uuid not null references public.nrcs_assets(id),
  position integer not null check(position>=0),
  primary key(output_id,asset_id), unique(output_id,position)
);
create table public.nrcs_social_outputs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.nrcs_stories(id),
  district_key text not null references public.nrcs_districts(district_key),
  destination text not null check(destination in ('Facebook','Instagram','TikTok','YouTube','X')),
  copy_version_id uuid references public.nrcs_copy_versions(id),
  status text not null default 'draft' check(status in ('draft','scheduled','published')),
  asset_ids uuid[] not null default '{}',
  scheduled_at timestamptz, published_at timestamptz, published_url text,
  revision integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.nrcs_homepage_lineups (
  district_key text primary key references public.nrcs_districts(district_key),
  hero_output_id uuid references public.nrcs_web_outputs(id),
  top_output_ids uuid[] not null default '{}',
  daily_edition_id uuid references public.nrcs_editions(id),
  daily_asset_id uuid references public.nrcs_assets(id),
  daily_publication_date date,
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  check(cardinality(top_output_ids)<=4),
  check((daily_edition_id is null and daily_asset_id is null and daily_publication_date is null)
     or (daily_edition_id is not null and daily_asset_id is not null and daily_publication_date is not null))
);
create table public.nrcs_priority_alerts (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key),
  headline text not null check(length(trim(headline)) between 1 and 240),
  message text not null default '' check(length(message)<=4000),
  active boolean not null default false,
  start_at timestamptz, end_at timestamptz,
  target_type text not null default 'none' check(target_type in ('none','story','event','external')),
  target_id uuid, external_url text,
  revision integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(end_at is null or start_at is null or end_at>start_at),
  check((target_type='none' and target_id is null and external_url is null)
    or (target_type in ('story','event') and target_id is not null and external_url is null)
    or (target_type='external' and target_id is null and external_url ~ '^https?://'))
);
create index nrcs_social_story_idx on public.nrcs_social_outputs(story_id);
create index nrcs_alert_district_idx on public.nrcs_priority_alerts(district_key,active);

alter table public.nrcs_web_output_media enable row level security;
alter table public.nrcs_social_outputs enable row level security;
alter table public.nrcs_homepage_lineups enable row level security;
alter table public.nrcs_priority_alerts enable row level security;
create policy media_read on public.nrcs_web_output_media for select using(exists(select 1 from public.nrcs_web_outputs o where o.id=output_id and public.nrcs_can_read_story(o.story_id)));
create policy media_write on public.nrcs_web_output_media for all using(exists(select 1 from public.nrcs_web_outputs o where o.id=output_id and public.nrcs_can_write_story(o.story_id) and (public.nrcs_has_role('editor') or o.status='draft'))) with check(exists(select 1 from public.nrcs_web_outputs o where o.id=output_id and public.nrcs_can_write_story(o.story_id) and (public.nrcs_has_role('editor') or o.status='draft')));
create policy social_read on public.nrcs_social_outputs for select using(public.nrcs_can_write_story(story_id));
create policy social_write on public.nrcs_social_outputs for all using(public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('editor') or status='draft')) with check(public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('editor') or status='draft'));
create policy lineup_editor on public.nrcs_homepage_lineups for all using(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key)) with check(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));
create policy alert_editor on public.nrcs_priority_alerts for all using(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key)) with check(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));
drop policy if exists "NRCS web outputs write" on public.nrcs_web_outputs;
create policy "NRCS web outputs write" on public.nrcs_web_outputs for all using(public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('editor') or status='draft')) with check(public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('editor') or status='draft'));

create function public.nrcs_validate_output() returns trigger language plpgsql security invoker set search_path=public as $$
declare kind text; asset uuid;
begin
  kind := case when TG_TABLE_NAME='nrcs_web_outputs' then 'web' else 'social' end;
  if not exists(select 1 from public.nrcs_stories s where s.id=new.story_id and s.district_key=new.district_key) then raise exception 'Story district mismatch'; end if;
  if TG_OP='UPDATE' and (new.story_id<>old.story_id or new.district_key<>old.district_key) then raise exception 'Output identity cannot change'; end if;
  if new.copy_version_id is not null and not exists(select 1 from public.nrcs_copy_versions v join public.nrcs_copy_streams s on s.id=v.stream_id where v.id=new.copy_version_id and s.story_id=new.story_id and s.stream_type::text=kind) then raise exception 'Select an exact % Copy version from this Story',kind; end if;
  if new.status::text<>'draft' then
    if not public.nrcs_has_role('editor') then raise exception 'Only editors/admins can schedule or publish'; end if;
    if new.copy_version_id is null then raise exception 'Copy version is required'; end if;
  end if;
  if new.status::text='scheduled' and new.scheduled_at is null then raise exception 'Scheduled time is required'; end if;
  if new.status::text='published' and new.published_at is null then raise exception 'Publication time is required'; end if;
  if kind='web' then
    if new.status::text in ('scheduled','published') and nullif(trim(new.slug),'') is null then raise exception 'Slug is required'; end if;
    if new.slug is not null and new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid slug'; end if;
    if new.hero_asset_id is not null and not exists(select 1 from public.nrcs_story_assets l join public.nrcs_assets a on a.id=l.asset_id where l.story_id=new.story_id and a.id=new.hero_asset_id and a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null) then raise exception 'Hero must be a Story image/graphic'; end if;
    if exists(select 1 from public.nrcs_web_output_media m where m.output_id=new.id and m.asset_id=new.hero_asset_id and m.position<>0) then raise exception 'Included Hero must be first in article media'; end if;
  else
    if cardinality(new.asset_ids)<>(select count(distinct x) from unnest(new.asset_ids) x) then raise exception 'Duplicate social media'; end if;
    if new.published_url is not null and new.published_url !~ '^https?://' then raise exception 'Invalid published URL'; end if;
    foreach asset in array new.asset_ids loop
      if not exists(select 1 from public.nrcs_story_assets l join public.nrcs_assets a on a.id=l.asset_id where l.story_id=new.story_id and a.id=asset and (a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null or a.asset_type::text='video' and a.mux_status='ready' and a.mux_playback_id is not null)) then raise exception 'Select ready Story media'; end if;
    end loop;
  end if;
  new.revision := case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_web_output before insert or update on public.nrcs_web_outputs for each row execute function public.nrcs_validate_output();
create trigger validate_social_output before insert or update on public.nrcs_social_outputs for each row execute function public.nrcs_validate_output();

create function public.nrcs_social_publication_completed() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.status='published' and (TG_OP='INSERT' or old.status<>'published') then
    update public.nrcs_stories set lifecycle_state='active',updated_by=auth.uid() where id=new.story_id and lifecycle_state='ready';
  end if;
  return new;
end $$;
create trigger social_publication_completed after insert or update on public.nrcs_social_outputs for each row execute function public.nrcs_social_publication_completed();

create function public.nrcs_validate_web_media() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from public.nrcs_web_outputs o join public.nrcs_story_assets l on l.story_id=o.story_id join public.nrcs_assets a on a.id=l.asset_id where o.id=new.output_id and a.id=new.asset_id and a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null and (a.id<>o.hero_asset_id or new.position=0)) then raise exception 'Article media must be Story images/graphics; included Hero must be first'; end if;
  return new;
end $$;
create trigger validate_web_media before insert or update on public.nrcs_web_output_media for each row execute function public.nrcs_validate_web_media();

create function public.nrcs_save_web_output(p_output jsonb,p_media uuid[],p_revision integer) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; current_row public.nrcs_web_outputs; hero uuid := nullif(p_output->>'hero_asset_id','')::uuid; media uuid[]:=coalesce(p_media,'{}');
begin
  if not public.nrcs_has_role('contributor') then raise exception 'Forbidden'; end if;
  if p_revision is null or p_revision<0 then raise exception 'Invalid revision'; end if;
  perform pg_advisory_xact_lock(hashtextextended('web-output:'||(p_output->>'story_id'),0));
  select * into current_row from public.nrcs_web_outputs where story_id=(p_output->>'story_id')::uuid for update;
  if current_row.id is not null and current_row.revision<>p_revision then raise exception 'Output changed. Reload before saving'; end if;
  if current_row.id is null and p_revision<>0 then raise exception 'Output changed. Reload before saving'; end if;
  if cardinality(media)<>(select count(distinct x) from unnest(media) x) then raise exception 'Duplicate article media'; end if;
  if hero=any(media) then media:=array_prepend(hero,array_remove(media,hero)); end if;
  -- Remove old media first so Hero changes and media replacement are one transaction.
  if current_row.id is not null then delete from public.nrcs_web_output_media where output_id=current_row.id; end if;
  insert into public.nrcs_web_outputs(id,story_id,district_key,copy_version_id,status,slug,hero_asset_id,seo_title,seo_description,scheduled_at,published_at)
  values(coalesce(current_row.id,gen_random_uuid()),(p_output->>'story_id')::uuid,p_output->>'district_key',nullif(p_output->>'copy_version_id','')::uuid,(p_output->>'status')::public.nrcs_web_output_status,nullif(p_output->>'slug',''),hero,nullif(p_output->>'seo_title',''),nullif(p_output->>'seo_description',''),nullif(p_output->>'scheduled_at','')::timestamptz,nullif(p_output->>'published_at','')::timestamptz)
  on conflict(story_id) do update set copy_version_id=excluded.copy_version_id,status=excluded.status,slug=excluded.slug,hero_asset_id=excluded.hero_asset_id,seo_title=excluded.seo_title,seo_description=excluded.seo_description,scheduled_at=excluded.scheduled_at,published_at=excluded.published_at returning id into result;
  insert into public.nrcs_web_output_media(output_id,asset_id,position) select result,x,ord-1 from unnest(media) with ordinality t(x,ord);
  return result;
end $$;

create function public.nrcs_validate_lineup() returns trigger language plpgsql security invoker set search_path=public as $$
declare output uuid;
begin
  if cardinality(new.top_output_ids)<>(select count(distinct x) from unnest(new.top_output_ids) x) then raise exception 'Duplicate Top Four selection'; end if;
  foreach output in array array_append(new.top_output_ids,new.hero_output_id) loop
    if output is not null and not exists(select 1 from public.nrcs_web_outputs o where o.id=output and o.district_key=new.district_key and o.status in ('scheduled','published')) then raise exception 'Homepage Stories must be scheduled/published Web Outputs from this district'; end if;
  end loop;
  if new.daily_edition_id is not null and not exists(select 1 from public.nrcs_editions e join public.nrcs_edition_assets l on l.edition_id=e.id join public.nrcs_assets a on a.id=l.asset_id where e.id=new.daily_edition_id and e.district_key=new.district_key and a.id=new.daily_asset_id and (a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null or a.asset_type::text='video' and a.mux_status='ready' and a.mux_playback_id is not null)) then raise exception 'Daily requires a ready asset attached to this district Edition'; end if;
  new.revision:=case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_lineup before insert or update on public.nrcs_homepage_lineups for each row execute function public.nrcs_validate_lineup();

create function public.nrcs_validate_priority_alert() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  -- Serialize schedule validation even when two editors enable alerts concurrently.
  perform pg_advisory_xact_lock(hashtextextended('priority-alert:'||new.district_key,0));
  if TG_OP='UPDATE' and new.district_key<>old.district_key then raise exception 'Alert district cannot change'; end if;
  if new.active and exists(select 1 from public.nrcs_priority_alerts a where a.district_key=new.district_key and a.active and a.id<>new.id and tstzrange(a.start_at,a.end_at,'[)') && tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'Another enabled alert overlaps this schedule. Disable it or adjust the times'; end if;
  if new.target_type='story' and not exists(select 1 from public.nrcs_web_outputs o where o.story_id=new.target_id and o.district_key=new.district_key and o.status='published') then raise exception 'Alert Story target must have a published Web Output in this district'; end if;
  if new.target_type='event' and not exists(select 1 from public.nrcs_events e where e.id=new.target_id and e.district_key=new.district_key and e.status::text='published') then raise exception 'Alert Event target must be published in this district'; end if;
  new.revision:=case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_priority_alert before insert or update on public.nrcs_priority_alerts for each row execute function public.nrcs_validate_priority_alert();

grant select,insert,update,delete on public.nrcs_web_output_media,public.nrcs_social_outputs,public.nrcs_homepage_lineups,public.nrcs_priority_alerts to authenticated;
revoke all on public.nrcs_web_output_media,public.nrcs_social_outputs,public.nrcs_homepage_lineups,public.nrcs_priority_alerts from anon;
revoke all on function public.nrcs_save_web_output(jsonb,uuid[],integer) from public,anon;
grant execute on function public.nrcs_save_web_output(jsonb,uuid[],integer) to authenticated;

create function public.nrcs_attach_output_image(p_asset jsonb,p_district text,p_story uuid default null,p_edition uuid default null) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
  if not public.nrcs_has_role('contributor') or not public.nrcs_can_access_district(p_district) then raise exception 'Forbidden'; end if;
  if (p_story is null)=(p_edition is null) then raise exception 'Choose one attachment context'; end if;
  if p_story is not null and not exists(select 1 from public.nrcs_stories s where s.id=p_story and s.district_key=p_district and public.nrcs_can_write_story(s.id)) then raise exception 'Story is not editable'; end if;
  if p_edition is not null and not exists(select 1 from public.nrcs_editions e where e.id=p_edition and e.district_key=p_district and public.nrcs_has_role('editor')) then raise exception 'Edition is not editable'; end if;
  if nullif(trim(p_asset->>'title'),'') is null or nullif(p_asset->>'cloudinary_public_id','') is null or coalesce(p_asset->>'cloudinary_url','') !~ '^https://res.cloudinary.com/' then raise exception 'Valid Cloudinary image is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-image:'||(p_asset->>'cloudinary_public_id'),0));
  select id into result from public.nrcs_assets where asset_type::text in ('image','graphic') and cloudinary_public_id=p_asset->>'cloudinary_public_id' order by created_at limit 1;
  if result is null then
    insert into public.nrcs_assets(asset_type,title,cloudinary_public_id,cloudinary_url,created_by,metadata) values('image',p_asset->>'title',p_asset->>'cloudinary_public_id',p_asset->>'cloudinary_url',auth.uid(),jsonb_build_object('origin_district_key',p_district)) returning id into result;
  end if;
  if p_story is not null then insert into public.nrcs_story_assets(story_id,asset_id) values(p_story,result) on conflict do nothing; end if;
  if p_edition is not null then insert into public.nrcs_edition_assets(edition_id,asset_id) values(p_edition,result) on conflict do nothing; end if;
  return result;
end $$;
revoke all on function public.nrcs_attach_output_image(jsonb,text,uuid,uuid) from public,anon;
grant execute on function public.nrcs_attach_output_image(jsonb,text,uuid,uuid) to authenticated;
commit;
