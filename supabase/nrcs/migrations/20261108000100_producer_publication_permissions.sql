begin;

-- Producers can publish district editorial content, while destructive and
-- administrative operations remain editor/admin responsibilities.
drop policy if exists media_write on public.nrcs_web_output_media;
create policy media_write on public.nrcs_web_output_media for all
using (exists (
  select 1 from public.nrcs_web_outputs o
  where o.id=output_id and public.nrcs_can_write_story(o.story_id)
    and (public.nrcs_has_role('producer') or o.status='draft')
))
with check (exists (
  select 1 from public.nrcs_web_outputs o
  where o.id=output_id and public.nrcs_can_write_story(o.story_id)
    and (public.nrcs_has_role('producer') or o.status='draft')
));

drop policy if exists social_write on public.nrcs_social_outputs;
drop policy if exists social_publisher_insert on public.nrcs_social_outputs;
drop policy if exists social_publisher_update on public.nrcs_social_outputs;
drop policy if exists social_editor_delete on public.nrcs_social_outputs;
create policy social_publisher_insert on public.nrcs_social_outputs for insert
with check (public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('producer') or status='draft'));
create policy social_publisher_update on public.nrcs_social_outputs for update
using (public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('producer') or status='draft'))
with check (public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('producer') or status='draft'));
create policy social_editor_delete on public.nrcs_social_outputs for delete
using (public.nrcs_has_role('editor') and public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS web outputs write" on public.nrcs_web_outputs;
drop policy if exists "NRCS web outputs publisher insert" on public.nrcs_web_outputs;
drop policy if exists "NRCS web outputs publisher update" on public.nrcs_web_outputs;
drop policy if exists "NRCS web outputs editor delete" on public.nrcs_web_outputs;
create policy "NRCS web outputs publisher insert" on public.nrcs_web_outputs for insert
with check (public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('producer') or status='draft'));
create policy "NRCS web outputs publisher update" on public.nrcs_web_outputs for update
using (public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('producer') or status='draft'))
with check (public.nrcs_can_write_story(story_id) and (public.nrcs_has_role('producer') or status='draft'));
create policy "NRCS web outputs editor delete" on public.nrcs_web_outputs for delete
using (public.nrcs_has_role('editor') and public.nrcs_can_write_story(story_id));

drop policy if exists lineup_editor on public.nrcs_homepage_lineups;
drop policy if exists lineup_publisher_insert on public.nrcs_homepage_lineups;
drop policy if exists lineup_publisher_update on public.nrcs_homepage_lineups;
drop policy if exists lineup_publisher_read on public.nrcs_homepage_lineups;
drop policy if exists lineup_editor_delete on public.nrcs_homepage_lineups;
create policy lineup_publisher_read on public.nrcs_homepage_lineups for select
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));
create policy lineup_publisher_insert on public.nrcs_homepage_lineups for insert
with check (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));
create policy lineup_publisher_update on public.nrcs_homepage_lineups for update
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));
create policy lineup_editor_delete on public.nrcs_homepage_lineups for delete
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists alert_editor on public.nrcs_priority_alerts;
drop policy if exists alert_publisher_read on public.nrcs_priority_alerts;
drop policy if exists alert_publisher_insert on public.nrcs_priority_alerts;
drop policy if exists alert_publisher_update on public.nrcs_priority_alerts;
drop policy if exists alert_editor_delete on public.nrcs_priority_alerts;
create policy alert_publisher_read on public.nrcs_priority_alerts for select
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));
create policy alert_publisher_insert on public.nrcs_priority_alerts for insert
with check (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));
create policy alert_publisher_update on public.nrcs_priority_alerts for update
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));
create policy alert_editor_delete on public.nrcs_priority_alerts for delete
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists daily_editor on public.nrcs_dailies;
drop policy if exists daily_publisher on public.nrcs_dailies;
create policy daily_publisher on public.nrcs_dailies for all
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));

drop policy if exists delivery_editor_read on public.nrcs_publication_deliveries;
drop policy if exists delivery_publisher_read on public.nrcs_publication_deliveries;
create policy delivery_publisher_read on public.nrcs_publication_deliveries for select
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));

drop policy if exists edition_assets_read on public.nrcs_edition_assets;
create policy edition_assets_read on public.nrcs_edition_assets for select
using (public.nrcs_has_role('producer') and exists (
  select 1 from public.nrcs_editions e
  where e.id=edition_id and public.nrcs_can_access_district(e.district_key)
));

drop policy if exists edition_assets_write on public.nrcs_edition_assets;
create policy edition_assets_write on public.nrcs_edition_assets for all
using (public.nrcs_has_role('producer') and exists (
  select 1 from public.nrcs_editions e
  where e.id=edition_id and e.status<>'archived' and public.nrcs_can_access_district(e.district_key)
))
with check (public.nrcs_has_role('producer') and exists (
  select 1 from public.nrcs_editions e
  where e.id=edition_id and e.status<>'archived' and public.nrcs_can_access_district(e.district_key)
) and (rundown_item_id is null or exists (
  select 1 from public.nrcs_rundown_items r
  where r.id=rundown_item_id and r.edition_id=nrcs_edition_assets.edition_id
)));

drop policy if exists "NRCS events contributor insert" on public.nrcs_events;
create policy "NRCS events contributor insert" on public.nrcs_events for insert
with check (
  public.nrcs_has_role('contributor')
  and public.nrcs_can_access_district(district_key)
  and (public.nrcs_has_role('editor') or public.nrcs_has_role('producer') and status<>'archived' or status='draft')
);

drop policy if exists "NRCS events contributor update" on public.nrcs_events;
create policy "NRCS events contributor update" on public.nrcs_events for update
using (
  public.nrcs_has_role('contributor')
  and public.nrcs_can_access_district(district_key)
  and (public.nrcs_has_role('editor') or public.nrcs_has_role('producer') and status<>'archived' or status='draft')
)
with check (
  public.nrcs_has_role('contributor')
  and public.nrcs_can_access_district(district_key)
  and (public.nrcs_has_role('editor') or public.nrcs_has_role('producer') and status<>'archived' or status='draft')
);

create or replace function public.nrcs_protect_alert_archive() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.archived_at is distinct from old.archived_at and not public.nrcs_has_role('editor') then
    raise exception 'Only editors or admins can archive or restore an Alert';
  end if;
  return new;
end; $$;
drop trigger if exists protect_alert_archive on public.nrcs_priority_alerts;
create trigger protect_alert_archive before update on public.nrcs_priority_alerts
for each row execute function public.nrcs_protect_alert_archive();

create or replace function public.nrcs_validate_output() returns trigger
language plpgsql security invoker set search_path=public as $$
declare kind text; asset uuid;
begin
  kind := case when TG_TABLE_NAME='nrcs_web_outputs' then 'web' else 'social' end;
  if not exists(select 1 from public.nrcs_stories s where s.id=new.story_id and s.district_key=new.district_key) then raise exception 'Story district mismatch'; end if;
  if TG_OP='UPDATE' and (new.story_id<>old.story_id or new.district_key<>old.district_key) then raise exception 'Output identity cannot change'; end if;
  if new.copy_version_id is not null and not exists(select 1 from public.nrcs_copy_versions v join public.nrcs_copy_streams s on s.id=v.stream_id where v.id=new.copy_version_id and s.story_id=new.story_id and s.stream_type::text=kind) then raise exception 'Select an exact % Copy version from this Story',kind; end if;
  if new.status::text<>'draft' then
    if not public.nrcs_has_role('producer') then raise exception 'Only producers, editors, or admins can schedule or publish'; end if;
    if new.copy_version_id is null then raise exception 'Copy version is required'; end if;
  end if;
  if new.status::text='unpublished' and not public.nrcs_has_role('editor') then raise exception 'Only editors or admins can unpublish'; end if;
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
end; $$;

create or replace function public.nrcs_validate_daily() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if not public.nrcs_has_role('producer') or not public.nrcs_can_access_district(new.district_key) then raise exception 'Producers, editors, or admins only'; end if;
  if new.status='archived' and not public.nrcs_has_role('editor') then raise exception 'Only editors or admins can archive a Daily'; end if;
  if TG_OP='UPDATE' and new.district_key<>old.district_key then raise exception 'Daily district cannot change'; end if;
  if not exists(select 1 from public.nrcs_editions e where e.id=new.edition_id and e.district_key=new.district_key) then raise exception 'Daily Edition district mismatch'; end if;
  if not exists(select 1 from public.nrcs_edition_assets l join public.nrcs_assets a on a.id=l.asset_id where l.edition_id=new.edition_id and a.id=new.hero_asset_id and a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null) then raise exception 'Daily requires a Cloudinary Hero graphic attached to its Edition'; end if;
  if not exists(select 1 from public.nrcs_edition_assets l join public.nrcs_assets a on a.id=l.asset_id where l.edition_id=new.edition_id and a.id=new.video_asset_id and a.asset_type::text='video' and a.mux_status='ready' and a.mux_playback_id is not null) then raise exception 'Daily requires a ready Mux video attached to its Edition'; end if;
  new.asset_id:=new.hero_asset_id;
  new.revision:=case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end; $$;

create or replace function public.nrcs_attach_output_image(p_asset jsonb,p_district text,p_story uuid default null,p_edition uuid default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
  if not public.nrcs_has_role('contributor') or not public.nrcs_can_access_district(p_district) then raise exception 'Forbidden'; end if;
  if (p_story is null)=(p_edition is null) then raise exception 'Choose one attachment context'; end if;
  if p_story is not null and not exists(select 1 from public.nrcs_stories s where s.id=p_story and s.district_key=p_district and public.nrcs_can_write_story(s.id)) then raise exception 'Story is not editable'; end if;
  if p_edition is not null and not exists(select 1 from public.nrcs_editions e where e.id=p_edition and e.district_key=p_district and public.nrcs_has_role('producer')) then raise exception 'Edition is not editable'; end if;
  if nullif(trim(p_asset->>'title'),'') is null or nullif(p_asset->>'cloudinary_public_id','') is null or coalesce(p_asset->>'cloudinary_url','') !~ '^https://res.cloudinary.com/' then raise exception 'Valid Cloudinary image is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-image:'||(p_asset->>'cloudinary_public_id'),0));
  select id into result from public.nrcs_assets where asset_type::text in ('image','graphic') and cloudinary_public_id=p_asset->>'cloudinary_public_id' order by created_at limit 1;
  if result is null then
    insert into public.nrcs_assets(asset_type,title,cloudinary_public_id,cloudinary_url,created_by,metadata) values('image',p_asset->>'title',p_asset->>'cloudinary_public_id',p_asset->>'cloudinary_url',auth.uid(),jsonb_build_object('origin_district_key',p_district)) returning id into result;
  end if;
  if p_story is not null then insert into public.nrcs_story_assets(story_id,asset_id) values(p_story,result) on conflict do nothing; end if;
  if p_edition is not null then insert into public.nrcs_edition_assets(edition_id,asset_id) values(p_edition,result) on conflict do nothing; end if;
  return result;
end; $$;

comment on type public.nrcs_staff_role is
  'Contributor owns limited work; producer performs district editorial production and publication without destructive administration; editor manages archival/configuration; admin manages the system.';

notify pgrst, 'reload schema';
commit;
