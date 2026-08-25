create table if not exists public.nrcs_districts (
  id uuid primary key default gen_random_uuid(),
  district_key text not null unique,
  subdomain text not null unique,
  display_name text not null,
  enabled boolean not null default false,
  primary_contact_name text null,
  primary_contact_email text null,
  primary_contact_phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_districts_key_normalized
    check (district_key = lower(trim(district_key)) and district_key ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint nrcs_districts_subdomain_normalized
    check (subdomain = lower(trim(subdomain)) and subdomain <> ''),
  constraint nrcs_districts_contact_email_normalized
    check (primary_contact_email is null or primary_contact_email = lower(trim(primary_contact_email)))
);

create table if not exists public.nrcs_staff_districts (
  staff_id uuid not null references public.nrcs_staff_profiles(id) on delete cascade,
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, district_key)
);

insert into public.nrcs_districts (
  district_key,
  subdomain,
  display_name,
  enabled,
  primary_contact_name,
  primary_contact_email,
  primary_contact_phone
)
values
  ('dlpc', 'dlpc.krtrlocal.tv', 'Dysart-La Porte City', true, null, null, null),
  ('vs', 'vs.krtrlocal.tv', 'Vinton-Shellsburg', false, null, null, null),
  ('bc', 'bc.krtrlocal.tv', 'Benton Community', false, null, null, null)
on conflict (district_key) do update set
  subdomain = excluded.subdomain,
  display_name = excluded.display_name,
  enabled = public.nrcs_districts.enabled,
  primary_contact_name = coalesce(public.nrcs_districts.primary_contact_name, excluded.primary_contact_name),
  primary_contact_email = coalesce(public.nrcs_districts.primary_contact_email, excluded.primary_contact_email),
  primary_contact_phone = coalesce(public.nrcs_districts.primary_contact_phone, excluded.primary_contact_phone);

insert into public.nrcs_staff_districts (staff_id, district_key)
select id, 'dlpc'
from public.nrcs_staff_profiles
where active = true
on conflict do nothing;

drop trigger if exists nrcs_districts_set_updated_at on public.nrcs_districts;
create trigger nrcs_districts_set_updated_at
before update on public.nrcs_districts
for each row execute procedure public.nrcs_set_updated_at();

create or replace function public.nrcs_can_access_district(requested_district_key text)
returns boolean as $$
  select exists (
    select 1
    from public.nrcs_staff_profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'admin'
  )
  or exists (
    select 1
    from public.nrcs_staff_profiles p
    join public.nrcs_staff_districts sd on sd.staff_id = p.id
    join public.nrcs_districts d on d.district_key = sd.district_key
    where p.id = auth.uid()
      and p.active = true
      and d.enabled = true
      and sd.district_key = lower(trim(requested_district_key))
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_current_district_keys()
returns setof text as $$
  select d.district_key
  from public.nrcs_districts d
  where d.enabled = true
    and (
      public.nrcs_is_admin()
      or exists (
        select 1
        from public.nrcs_staff_districts sd
        where sd.staff_id = auth.uid()
          and sd.district_key = d.district_key
      )
    )
  order by case when d.district_key = 'dlpc' then 0 else 1 end, d.display_name;
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_handle_new_user()
returns trigger as $$
declare
  invite public.nrcs_staff_invitations;
  normalized_email text;
begin
  normalized_email := lower(trim(new.email));

  select *
  into invite
  from public.nrcs_staff_invitations
  where email = normalized_email
    and active = true
  limit 1;

  if invite.id is null then
    return new;
  end if;

  insert into public.nrcs_staff_profiles (
    id,
    email,
    display_name,
    role,
    active
  )
  values (
    new.id,
    normalized_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    invite.role,
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.nrcs_staff_profiles.display_name, excluded.display_name),
    role = excluded.role,
    active = true;

  insert into public.nrcs_staff_districts (staff_id, district_key)
  values (new.id, 'dlpc')
  on conflict do nothing;

  update public.nrcs_staff_invitations
  set accepted_at = coalesce(accepted_at, now())
  where id = invite.id;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

alter table public.nrcs_districts enable row level security;
alter table public.nrcs_staff_districts enable row level security;

drop policy if exists "NRCS districts active staff read" on public.nrcs_districts;
create policy "NRCS districts active staff read"
on public.nrcs_districts for select
using (
  public.nrcs_is_admin()
  or exists (
    select 1
    from public.nrcs_staff_districts sd
    where sd.staff_id = auth.uid()
      and sd.district_key = public.nrcs_districts.district_key
  )
);

drop policy if exists "NRCS districts admin full" on public.nrcs_districts;
create policy "NRCS districts admin full"
on public.nrcs_districts for all
using (public.nrcs_is_admin())
with check (public.nrcs_is_admin());

drop policy if exists "NRCS staff districts read own" on public.nrcs_staff_districts;
create policy "NRCS staff districts read own"
on public.nrcs_staff_districts for select
using (staff_id = auth.uid() and public.nrcs_has_role('contributor'));

drop policy if exists "NRCS staff districts admin full" on public.nrcs_staff_districts;
create policy "NRCS staff districts admin full"
on public.nrcs_staff_districts for all
using (public.nrcs_is_admin())
with check (public.nrcs_is_admin());

comment on table public.nrcs_districts is
  'NRCS read model of CMS-owned districts. Used for district-scoped editorial permissions and display context.';

comment on table public.nrcs_staff_districts is
  'District access join table for global NRCS staff profiles.';
