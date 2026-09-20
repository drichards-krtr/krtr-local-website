begin;

alter table public.nrcs_dailies
  add column if not exists hero_asset_id uuid references public.nrcs_assets(id),
  add column if not exists video_asset_id uuid references public.nrcs_assets(id);

update public.nrcs_dailies d
set hero_asset_id=d.asset_id
from public.nrcs_assets a
where a.id=d.asset_id and a.asset_type::text in ('image','graphic') and d.hero_asset_id is null;

update public.nrcs_dailies d
set video_asset_id=d.asset_id
from public.nrcs_assets a
where a.id=d.asset_id and a.asset_type::text='video' and d.video_asset_id is null;

create or replace function public.nrcs_validate_daily() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not public.nrcs_has_role('editor') or not public.nrcs_can_access_district(new.district_key) then raise exception 'Editors/admins only'; end if;
  if TG_OP='UPDATE' and new.district_key<>old.district_key then raise exception 'Daily district cannot change'; end if;
  if not exists(select 1 from public.nrcs_editions e where e.id=new.edition_id and e.district_key=new.district_key) then raise exception 'Daily Edition district mismatch'; end if;
  if not exists(select 1 from public.nrcs_edition_assets l join public.nrcs_assets a on a.id=l.asset_id where l.edition_id=new.edition_id and a.id=new.hero_asset_id and a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null) then raise exception 'Daily requires a Cloudinary Hero graphic attached to its Edition'; end if;
  if not exists(select 1 from public.nrcs_edition_assets l join public.nrcs_assets a on a.id=l.asset_id where l.edition_id=new.edition_id and a.id=new.video_asset_id and a.asset_type::text='video' and a.mux_status='ready' and a.mux_playback_id is not null) then raise exception 'Daily requires a ready Mux video attached to its Edition'; end if;
  new.asset_id:=new.hero_asset_id;
  new.revision:=case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end $$;

commit;
