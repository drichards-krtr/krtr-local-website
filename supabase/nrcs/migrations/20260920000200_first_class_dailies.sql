begin;

create table public.nrcs_dailies (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key),
  edition_id uuid not null references public.nrcs_editions(id),
  asset_id uuid not null references public.nrcs_assets(id),
  status text not null default 'draft' check(status in ('draft','scheduled','published','archived')),
  scheduled_at timestamptz not null,
  revision integer not null default 1,
  created_by uuid not null default auth.uid() references public.nrcs_staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(edition_id)
);
create index nrcs_dailies_district_schedule_idx on public.nrcs_dailies(district_key,scheduled_at desc);

create function public.nrcs_validate_daily() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not public.nrcs_has_role('editor') or not public.nrcs_can_access_district(new.district_key) then raise exception 'Editors/admins only'; end if;
  if TG_OP='UPDATE' and new.district_key<>old.district_key then raise exception 'Daily district cannot change'; end if;
  if not exists(select 1 from public.nrcs_editions e where e.id=new.edition_id and e.district_key=new.district_key) then raise exception 'Daily Edition district mismatch'; end if;
  if not exists(select 1 from public.nrcs_edition_assets l join public.nrcs_assets a on a.id=l.asset_id where l.edition_id=new.edition_id and a.id=new.asset_id and (a.asset_type::text in ('image','graphic') and a.cloudinary_url is not null or a.asset_type::text='video' and a.mux_status='ready' and a.mux_playback_id is not null)) then raise exception 'Daily requires ready media attached to its Edition'; end if;
  new.revision:=case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_daily before insert or update on public.nrcs_dailies for each row execute function public.nrcs_validate_daily();

alter table public.nrcs_dailies enable row level security;
create policy daily_editor on public.nrcs_dailies for all using(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key)) with check(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));
grant select,insert,update on public.nrcs_dailies to authenticated;
revoke all on public.nrcs_dailies from anon;

alter table public.nrcs_publication_deliveries drop constraint if exists nrcs_publication_deliveries_kind_check;
alter table public.nrcs_publication_deliveries add constraint nrcs_publication_deliveries_kind_check check(kind in ('web','homepage','alert','daily'));

commit;
