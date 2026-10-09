create or replace function public.nrcs_normalize_location_part(value text)
returns text language sql immutable parallel safe as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.nrcs_location_identity(name text, address text, city text, state text, zip text)
returns text language sql immutable parallel safe as $$
  select concat_ws('|',
    public.nrcs_normalize_location_part(name),
    public.nrcs_normalize_location_part(address),
    public.nrcs_normalize_location_part(city),
    public.nrcs_normalize_location_part(state),
    public.nrcs_normalize_location_part(zip)
  );
$$;

create table if not exists public.nrcs_locations (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  name text not null,
  address text not null,
  city text not null,
  state text not null,
  zip text not null,
  identity_key text not null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_locations_fields_present check (
    trim(name) <> '' and trim(address) <> '' and trim(city) <> '' and trim(state) <> '' and trim(zip) <> ''
  ),
  constraint nrcs_locations_identity_matches check (
    identity_key = public.nrcs_location_identity(name, address, city, state, zip)
  ),
  constraint nrcs_locations_district_identity_unique unique (district_key, identity_key)
);

alter table public.nrcs_events
  add column if not exists location_id uuid null references public.nrcs_locations(id) on delete set null;

insert into public.nrcs_locations (district_key, name, address, city, state, zip, identity_key, created_by)
select distinct on (e.district_key, public.nrcs_location_identity(e.location_name, e.address, e.city, e.state, e.zip))
  e.district_key, trim(e.location_name), trim(e.address), trim(e.city), upper(trim(e.state)), trim(e.zip),
  public.nrcs_location_identity(e.location_name, e.address, e.city, e.state, e.zip), e.created_by
from public.nrcs_events e
where nullif(trim(e.location_name), '') is not null
  and nullif(trim(e.address), '') is not null
  and nullif(trim(e.city), '') is not null
  and nullif(trim(e.state), '') is not null
  and nullif(trim(e.zip), '') is not null
order by e.district_key, public.nrcs_location_identity(e.location_name, e.address, e.city, e.state, e.zip), e.created_at
on conflict (district_key, identity_key) do nothing;

update public.nrcs_events e
set location_id = l.id
from public.nrcs_locations l
where e.location_id is null
  and l.district_key = e.district_key
  and l.identity_key = public.nrcs_location_identity(e.location_name, e.address, e.city, e.state, e.zip);

alter table public.nrcs_locations enable row level security;

drop policy if exists "NRCS locations district read" on public.nrcs_locations;
create policy "NRCS locations district read" on public.nrcs_locations for select
using (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS locations contributor insert" on public.nrcs_locations;
create policy "NRCS locations contributor insert" on public.nrcs_locations for insert
with check (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS locations contributor update" on public.nrcs_locations;
create policy "NRCS locations contributor update" on public.nrcs_locations for update
using (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key));

create or replace function public.nrcs_resolve_event_location(
  p_district_key text,
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_zip text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  resolved_id uuid;
  resolved_key text := public.nrcs_location_identity(p_name, p_address, p_city, p_state, p_zip);
begin
  if public.nrcs_normalize_location_part(p_name) = ''
    or public.nrcs_normalize_location_part(p_address) = ''
    or public.nrcs_normalize_location_part(p_city) = ''
    or public.nrcs_normalize_location_part(p_state) = ''
    or public.nrcs_normalize_location_part(p_zip) = '' then
    return null;
  end if;

  insert into public.nrcs_locations (district_key, name, address, city, state, zip, identity_key, created_by)
  values (lower(trim(p_district_key)), trim(p_name), trim(p_address), trim(p_city), upper(trim(p_state)), trim(p_zip), resolved_key, auth.uid())
  on conflict (district_key, identity_key) do update set updated_at = public.nrcs_locations.updated_at
  returning id into resolved_id;

  return resolved_id;
end;
$$;

grant execute on function public.nrcs_resolve_event_location(text, text, text, text, text, text) to authenticated;

create index if not exists nrcs_locations_district_name_idx on public.nrcs_locations (district_key, lower(name));
create index if not exists nrcs_events_location_id_idx on public.nrcs_events (location_id);

comment on table public.nrcs_locations is 'District-owned reusable event locations. Events retain address snapshots and optionally reference a canonical location.';
