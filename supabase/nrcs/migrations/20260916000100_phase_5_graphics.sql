-- Phase 5 is NRCS-only. Shared identities; district selections; contextual graphics.
create table public.nrcs_school_identities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  mascot text check (mascot is null or length(trim(mascot)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  kind text not null default 'school' check (kind in ('school', 'coop')),
  logo_url text,
  legacy_logo_path text,
  primary_school_id uuid references public.nrcs_school_identities(id),
  partner_school_id uuid references public.nrcs_school_identities(id),
  composition_recipe jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_url is not null or legacy_logo_path is not null),
  check (mascot is not null or legacy_logo_path is not null),
  check ((kind = 'school' and primary_school_id is null and partner_school_id is null)
    or (kind = 'coop' and primary_school_id is not null and partner_school_id is not null
      and primary_school_id <> partner_school_id and primary_school_id <> id and partner_school_id <> id))
);
create table public.nrcs_district_schools (
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  school_id uuid not null references public.nrcs_school_identities(id),
  is_default boolean not null default false,
  primary key (district_key, school_id)
);
create unique index nrcs_district_school_default on public.nrcs_district_schools(district_key) where is_default;
create unique index nrcs_school_identity_display_name on public.nrcs_school_identities(lower(trim(display_name)));

create table public.nrcs_edition_assets (
  edition_id uuid not null references public.nrcs_editions(id) on delete cascade,
  asset_id uuid not null references public.nrcs_assets(id) on delete cascade,
  rundown_item_id uuid references public.nrcs_rundown_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (edition_id, asset_id)
);
create index nrcs_edition_assets_item on public.nrcs_edition_assets(rundown_item_id);
create trigger nrcs_school_identities_updated before update on public.nrcs_school_identities
for each row execute function public.nrcs_set_updated_at();

create function public.nrcs_validate_school_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind = 'coop' and (
    not exists (select 1 from public.nrcs_school_identities where id = new.primary_school_id and kind = 'school')
    or not exists (select 1 from public.nrcs_school_identities where id = new.partner_school_id and kind = 'school')
  ) then raise exception 'Co-op parents must be school identities'; end if;
  if tg_op = 'UPDATE' and new.kind <> old.kind then raise exception 'Identity type cannot be changed'; end if;
  return new;
end $$;
create trigger nrcs_validate_school_identity before insert or update on public.nrcs_school_identities
for each row execute function public.nrcs_validate_school_identity();

alter table public.nrcs_school_identities enable row level security;
alter table public.nrcs_district_schools enable row level security;
alter table public.nrcs_edition_assets enable row level security;
create policy schools_read on public.nrcs_school_identities for select using (public.nrcs_has_role('contributor'));
create policy schools_insert on public.nrcs_school_identities for insert with check (public.nrcs_has_role('editor'));
create policy schools_update on public.nrcs_school_identities for update using (public.nrcs_has_role('editor')) with check (public.nrcs_has_role('editor'));
create policy district_schools_read on public.nrcs_district_schools for select using (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key));
create policy district_schools_write on public.nrcs_district_schools for all using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key)) with check (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));
create policy edition_assets_read on public.nrcs_edition_assets for select using (
  public.nrcs_has_role('editor') and exists (select 1 from public.nrcs_editions e where e.id = edition_id and public.nrcs_can_access_district(e.district_key))
);
create policy edition_assets_write on public.nrcs_edition_assets for all using (
  public.nrcs_has_role('editor') and exists (select 1 from public.nrcs_editions e where e.id = edition_id and public.nrcs_can_access_district(e.district_key))
) with check (
  public.nrcs_has_role('editor') and exists (select 1 from public.nrcs_editions e where e.id = edition_id and public.nrcs_can_access_district(e.district_key))
  and (rundown_item_id is null or exists (select 1 from public.nrcs_rundown_items r where r.id = rundown_item_id and r.edition_id = nrcs_edition_assets.edition_id))
);
-- Tighten the existing shared-image policy to staff only, keeping the common pool.
drop policy if exists "NRCS assets staff read" on public.nrcs_assets;
create policy "NRCS assets staff read" on public.nrcs_assets for select using (
  public.nrcs_has_role('contributor') and (public.nrcs_has_role('editor') or created_by = auth.uid() or asset_type in ('image', 'graphic'))
);

create function public.nrcs_set_district_schools(p_district text, p_schools uuid[], p_default uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.nrcs_has_role('editor') or not public.nrcs_can_access_district(p_district) then raise exception 'Forbidden'; end if;
  if p_default is not null and not (p_default = any(p_schools)) then raise exception 'Default school must be selected'; end if;
  delete from public.nrcs_district_schools where district_key = p_district;
  insert into public.nrcs_district_schools(district_key, school_id, is_default)
    select p_district, s, coalesce(s = p_default, false) from unnest(p_schools) s;
end $$;

-- Asset + tags + relationship are committed together under the caller's RLS.
create function public.nrcs_register_generated_graphic(p_asset jsonb, p_story uuid default null, p_edition uuid default null, p_item uuid default null, p_tags uuid[] default '{}')
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  asset_id uuid := (p_asset->>'id')::uuid;
  district text := nullif(p_asset->>'district_key', '');
  category uuid := nullif(p_asset->>'category_id', '')::uuid;
  existing_owner uuid;
begin
  if not public.nrcs_has_role('contributor') then raise exception 'Forbidden'; end if;
  if district is null or not public.nrcs_can_access_district(district) then raise exception 'District is not accessible'; end if;
  if p_story is not null and p_edition is not null then raise exception 'Choose one attachment context'; end if;
  if p_item is not null and p_edition is null then raise exception 'An item requires an Edition'; end if;
  if p_story is not null and not exists (select 1 from public.nrcs_stories s where s.id = p_story and s.district_key = district and public.nrcs_can_write_story(s.id)) then raise exception 'Story is not editable'; end if;
  if p_edition is not null and not exists (select 1 from public.nrcs_editions e where e.id = p_edition and e.district_key = district and public.nrcs_has_role('editor')) then raise exception 'Edition is not editable'; end if;
  if p_item is not null and not exists (select 1 from public.nrcs_rundown_items r where r.id = p_item and r.edition_id = p_edition) then raise exception 'Item does not belong to Edition'; end if;
  if category is not null and not exists (select 1 from public.nrcs_categories c where c.id = category and c.district_key = district) then raise exception 'Invalid category'; end if;
  if length(trim(p_asset->>'title')) = 0 then raise exception 'Title is required'; end if;
  select created_by into existing_owner from public.nrcs_assets where id = asset_id;
  if found and existing_owner is distinct from auth.uid() then raise exception 'Asset belongs to another user'; end if;
  insert into public.nrcs_assets(id, asset_type, title, cloudinary_public_id, cloudinary_url, category_id, metadata, created_by)
  values (asset_id, 'graphic', p_asset->>'title', p_asset->>'cloudinary_public_id', p_asset->>'cloudinary_url', category,
    coalesce(p_asset->'metadata', '{}'::jsonb) || jsonb_build_object('origin_district_key', district), auth.uid())
  on conflict (id) do nothing;
  insert into public.nrcs_asset_tags(asset_id, tag_id) select asset_id, t from unnest(p_tags) t on conflict do nothing;
  if p_story is not null then insert into public.nrcs_story_assets(story_id, asset_id) values (p_story, asset_id) on conflict do nothing; end if;
  if p_edition is not null then insert into public.nrcs_edition_assets(edition_id, asset_id, rundown_item_id) values (p_edition, asset_id, p_item) on conflict do nothing; end if;
  return asset_id;
end $$;
revoke all on function public.nrcs_set_district_schools(text, uuid[], uuid) from public, anon;
revoke all on function public.nrcs_register_generated_graphic(jsonb, uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.nrcs_set_district_schools(text, uuid[], uuid) to authenticated;
grant execute on function public.nrcs_register_generated_graphic(jsonb, uuid, uuid, uuid, uuid[]) to authenticated;
grant select, insert, update on public.nrcs_school_identities to authenticated;
grant select, insert, update, delete on public.nrcs_district_schools, public.nrcs_edition_assets to authenticated;

-- Seed the original identities and preserve original labels/artwork. Cloudinary import is explicit.
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Union Knights')::uuid, 'Union', 'Knights', 'Union Knights', '/graphics/legacy/union-knights.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Clear Creek Amana')::uuid, 'Clear Creek Amana', 'Clippers', 'Clear Creek Amana', '/graphics/legacy/clear_creek_amana-clippers.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Columbus Catholic')::uuid, 'Columbus Catholic', 'Sailors', 'Columbus Catholic', '/graphics/legacy/columbus_catholic-sailors.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Dike-New Hartford')::uuid, 'Dike-New Hartford', 'Wolverines', 'Dike-New Hartford', '/graphics/legacy/dike_new_hartford-wolverines.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Hudson')::uuid, 'Hudson', 'Pirates', 'Hudson', '/graphics/legacy/hudson-pirates.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Independence')::uuid, 'Independence', 'Mustangs', 'Independence', '/graphics/legacy/independence-mustangs.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Lake Mills')::uuid, 'Lake Mills', 'Bulldogs', 'Lake Mills', '/graphics/legacy/lake_mills-bulldogs.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:North Butler')::uuid, 'North Butler', 'Bobcats', 'North Butler', '/graphics/legacy/north_butler-bobcats.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Oelwein')::uuid, 'Oelwein', 'Huskies', 'Oelwein', '/graphics/legacy/oelwein-huskies.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Osage')::uuid, 'Osage', 'Green Devils', 'Osage', '/graphics/legacy/osage-green_devils.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:South Hardin')::uuid, 'South Hardin', 'Tigers', 'South Hardin', '/graphics/legacy/south_hardin-tigers.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Wapsie Valley')::uuid, 'Wapsie Valley', 'Warriors', 'Wapsie Valley', '/graphics/legacy/wapsie_valley-warriors.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Mount Vernon')::uuid, 'Mount Vernon', 'Mustangs', 'Mount Vernon', '/graphics/legacy/mount_vernon-mustangs.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Waverly-Shell Rock')::uuid, 'Waverly-Shell Rock', 'Go Hawks', 'Waverly-Shell Rock', '/graphics/legacy/waverly_shell_rock-go_hawks.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Decorah')::uuid, 'Decorah', 'Vikings', 'Decorah', '/graphics/legacy/decorah-vikings.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:New Hampton')::uuid, 'New Hampton', 'Chickasaws', 'New Hampton', '/graphics/legacy/new_hampton-chickasaws.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Anamosa')::uuid, 'Anamosa', 'Blue Raiders', 'Anamosa', '/graphics/legacy/anamosa-blue_raiders.png');
-- These filenames contain no mascot metadata. Preserve them until staff fills it in.
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Waterloo East')::uuid, 'Waterloo East', null, 'Waterloo East', '/graphics/legacy/waterloo-east.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Waterloo West')::uuid, 'Waterloo West', null, 'Waterloo West', '/graphics/legacy/waterloo-west.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Waterloo United')::uuid, 'Waterloo United', null, 'Waterloo United', '/graphics/legacy/waterloo-united.jpg');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:South Tama County')::uuid, 'South Tama County', 'Trojans', 'South Tama County', '/graphics/legacy/south_tama_county-trojans.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Cedar Falls')::uuid, 'Cedar Falls', 'Tigers', 'Cedar Falls', '/graphics/legacy/cedar_falls-tigers.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Hillcrest Academy')::uuid, 'Hillcrest Academy', 'Ravens', 'Hillcrest Academy', '/graphics/legacy/hillcrest_academy-ravens.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Jesup')::uuid, 'Jesup', 'J Hawks', 'Jesup', '/graphics/legacy/jesup-j_hawks.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Cedar Rapids Jefferson')::uuid, 'Cedar Rapids Jefferson', 'J Hawks', 'Cedar Rapids Jefferson', '/graphics/legacy/cedar_rapids_jefferson-j_hawks.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, legacy_logo_path) values (md5('krtr-school:Grundy Center')::uuid, 'Grundy Center', 'Spartans', 'Grundy Center', '/graphics/legacy/grundy_center-spartans.png');
insert into public.nrcs_school_identities(id, name, mascot, display_name, kind, legacy_logo_path, primary_school_id, partner_school_id, composition_recipe) values (md5('krtr-school:Co-op Waterloo East')::uuid, 'Co-op Waterloo East', 'Knights', 'Co-op Waterloo East', 'coop', '/graphics/legacy/union-east.png', md5('krtr-school:Union Knights')::uuid, md5('krtr-school:Waterloo East')::uuid, '{"version":1,"partner_x":0,"partner_y":0.5,"partner_width":0.5,"partner_height":0.5,"legacy_preserved":true}');
insert into public.nrcs_school_identities(id, name, mascot, display_name, kind, legacy_logo_path, primary_school_id, partner_school_id, composition_recipe) values (md5('krtr-school:Co-Op Waterloo West')::uuid, 'Co-Op Waterloo West', 'Knights', 'Co-Op Waterloo West', 'coop', '/graphics/legacy/union-west.png', md5('krtr-school:Union Knights')::uuid, md5('krtr-school:Waterloo West')::uuid, '{"version":1,"partner_x":0,"partner_y":0.5,"partner_width":0.5,"partner_height":0.5,"legacy_preserved":true}');
insert into public.nrcs_school_identities(id, name, mascot, display_name, kind, legacy_logo_path, primary_school_id, partner_school_id, composition_recipe) values (md5('krtr-school:Co-Op Waterloo United')::uuid, 'Co-Op Waterloo United', 'Knights', 'Co-Op Waterloo United', 'coop', '/graphics/legacy/union-united.png', md5('krtr-school:Union Knights')::uuid, md5('krtr-school:Waterloo United')::uuid, '{"version":1,"partner_x":0,"partner_y":0.5,"partner_width":0.5,"partner_height":0.5,"legacy_preserved":true}');
insert into public.nrcs_district_schools(district_key, school_id, is_default) select 'dlpc', id, id = md5('krtr-school:Union Knights')::uuid from public.nrcs_school_identities where exists (select 1 from public.nrcs_districts where district_key = 'dlpc');
