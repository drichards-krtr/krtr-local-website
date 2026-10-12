-- Apply ONLY to the dedicated Sales Supabase project, never CMS or NRCS.
begin;
create schema if not exists sales_private;
revoke all on schema sales_private from public, anon, authenticated;
grant usage on schema sales_private to authenticated;

create type public.sales_staff_role as enum ('district_manager', 'regional_manager', 'salesperson', 'production_agent');

create table public.sales_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text check (char_length(display_name) <= 100),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Exactly one owner: configured explicitly by trusted SQL, never by signup metadata.
create table public.sales_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references public.sales_profiles(id) on delete restrict
);
create table public.sales_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sales_regions_unique_name on public.sales_regions(lower(btrim(name)));
create table public.sales_districts (
  district_key text primary key check (district_key ~ '^[a-z][a-z0-9_-]{1,31}$'),
  name text not null,
  timezone text not null default 'America/Chicago' check (timezone = 'America/Chicago'),
  region_id uuid references public.sales_regions(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sales_staff_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sales_profiles(id) on delete restrict,
  role public.sales_staff_role not null,
  district_key text references public.sales_districts(district_key) on delete restrict,
  region_id uuid references public.sales_regions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'regional_manager' and region_id is not null and district_key is null)
    or (role <> 'regional_manager' and district_key is not null and region_id is null))
);
create unique index sales_staff_district_scope on public.sales_staff_scopes(user_id, role, district_key) where district_key is not null;
create unique index sales_staff_region_scope on public.sales_staff_scopes(user_id, role, region_id) where region_id is not null;
create index sales_staff_scopes_user on public.sales_staff_scopes(user_id);
create index sales_districts_region on public.sales_districts(region_id);

create table public.sales_studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district_key text not null references public.sales_districts(district_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, district_key)
);
create table public.sales_shows (
  id uuid primary key default gen_random_uuid(),
  show_key text not null,
  name text not null,
  district_key text not null references public.sales_districts(district_key),
  studio_id uuid,
  publication_weekdays smallint[] not null check (cardinality(publication_weekdays) between 1 and 7 and publication_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  publication_time time not null,
  publishes_on_holidays boolean not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(district_key, show_key),
  foreign key(studio_id, district_key) references public.sales_studios(id, district_key)
);
-- Identity and membership foundation only; onboarding and transfer workflows are Chunk 2.
create table public.sales_organizations (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(btrim(company_name)) between 1 and 200),
  salesperson_id uuid references public.sales_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sales_organization_districts (
  organization_id uuid not null references public.sales_organizations(id),
  district_key text not null references public.sales_districts(district_key),
  created_at timestamptz not null default now(),
  primary key(organization_id, district_key)
);
create table public.sales_organization_members (
  organization_id uuid not null references public.sales_organizations(id),
  user_id uuid not null references public.sales_profiles(id),
  can_view boolean not null default true,
  can_approve_assets boolean not null default false,
  can_sign_agreements boolean not null default false,
  is_account_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(organization_id, user_id),
  check (can_view or (not can_approve_assets and not can_sign_agreements and not is_account_owner))
);
create unique index sales_organization_one_owner on public.sales_organization_members(organization_id) where is_account_owner;
create index sales_organization_members_user on public.sales_organization_members(user_id);
create table public.sales_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  operation text not null,
  before_record jsonb,
  after_record jsonb,
  occurred_at timestamptz not null default now()
);

create function sales_private.active_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sales_profiles p where p.id = auth.uid() and p.active);
$$;
create function sales_private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select sales_private.active_user() and exists(select 1 from public.sales_owner o where o.user_id = auth.uid());
$$;
create function sales_private.can_manage_district(target text) returns boolean language sql stable security definer set search_path = '' as $$
  select sales_private.is_owner() or (sales_private.active_user() and exists (
    select 1 from public.sales_staff_scopes s join public.sales_districts d on d.district_key = target
    where s.user_id = auth.uid() and ((s.role = 'district_manager' and s.district_key = target)
      or (s.role = 'regional_manager' and s.region_id = d.region_id))
  ));
$$;
create function sales_private.can_view_district(target text) returns boolean language sql stable security definer set search_path = '' as $$
  select sales_private.can_manage_district(target) or (sales_private.active_user() and exists (
    select 1 from public.sales_staff_scopes s where s.user_id = auth.uid() and s.district_key = target
  ));
$$;
create function sales_private.can_view_organization(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select sales_private.is_owner() or (sales_private.active_user() and (
    exists(select 1 from public.sales_organization_members m where m.organization_id = target and m.user_id = auth.uid() and m.can_view)
    or exists(select 1 from public.sales_organizations o where o.id = target and o.salesperson_id = auth.uid())
    or exists(select 1 from public.sales_organization_districts d where d.organization_id = target and sales_private.can_manage_district(d.district_key))
  ));
$$;
-- Whole-organization customer/owner access is separate from district-manager scope.
create function sales_private.owns_or_belongs_to_organization(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select sales_private.is_owner() or (sales_private.active_user() and (
    exists(select 1 from public.sales_organization_members m where m.organization_id = target and m.user_id = auth.uid() and m.can_view)
    or exists(select 1 from public.sales_organizations o where o.id = target and o.salesperson_id = auth.uid())
  ));
$$;
create function sales_private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
  begin new.updated_at = now(); return new; end;
$$;
create function sales_private.capture_audit() returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.sales_audit_events(actor_id, table_name, operation, before_record, after_record)
    values(auth.uid(), tg_table_name, tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
    if tg_op = 'DELETE' then return old; else return new; end if;
  end;
$$;
create function sales_private.protect_owner_activation() returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    if not new.active and exists(select 1 from public.sales_owner where user_id = new.id) then
      raise exception 'The owner account cannot be deactivated';
    end if;
    return new;
  end;
$$;
create trigger sales_owner_stays_active before update on public.sales_profiles for each row execute function sales_private.protect_owner_activation();
-- New auth identities receive no active status, role, owner status or organization permission.
create function sales_private.on_auth_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
  begin insert into public.sales_profiles(id) values(new.id); return new; end;
$$;
create trigger sales_auth_user_created after insert on auth.users for each row execute function sales_private.on_auth_user_created();

revoke all on all functions in schema sales_private from public, anon, authenticated;
grant execute on function sales_private.active_user(), sales_private.is_owner(), sales_private.can_manage_district(text), sales_private.can_view_district(text), sales_private.can_view_organization(uuid), sales_private.owns_or_belongs_to_organization(uuid) to authenticated;

-- Enable RLS on every Sales table and audit every administrative mutation.
do $$
declare t text;
begin
  foreach t in array array['sales_profiles','sales_owner','sales_regions','sales_districts','sales_staff_scopes','sales_studios','sales_shows','sales_organizations','sales_organization_districts','sales_organization_members','sales_audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    if t <> 'sales_audit_events' then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function sales_private.capture_audit()', t || '_audit', t);
    end if;
  end loop;
  foreach t in array array['sales_profiles','sales_regions','sales_districts','sales_staff_scopes','sales_studios','sales_shows','sales_organizations','sales_organization_members'] loop
    execute format('create trigger %I before update on public.%I for each row execute function sales_private.touch_updated_at()', t || '_updated', t);
  end loop;
end $$;

create policy sales_profiles_read on public.sales_profiles for select to authenticated using (id = auth.uid() or sales_private.is_owner());
create policy sales_owner_read on public.sales_owner for select to authenticated using (user_id = auth.uid() and sales_private.active_user());
create policy sales_regions_read on public.sales_regions for select to authenticated using (
  sales_private.is_owner() or exists(select 1 from public.sales_districts d where d.region_id = sales_regions.id and sales_private.can_manage_district(d.district_key))
);
create policy sales_districts_read on public.sales_districts for select to authenticated using (sales_private.can_view_district(district_key));
create policy sales_staff_scopes_read on public.sales_staff_scopes for select to authenticated using (sales_private.is_owner() or (user_id = auth.uid() and sales_private.active_user()));
create policy sales_studios_read on public.sales_studios for select to authenticated using (sales_private.can_view_district(district_key));
create policy sales_shows_read on public.sales_shows for select to authenticated using (sales_private.can_view_district(district_key));
create policy sales_organizations_read on public.sales_organizations for select to authenticated using (sales_private.can_view_organization(id));
create policy sales_organization_districts_read on public.sales_organization_districts for select to authenticated using (
  sales_private.owns_or_belongs_to_organization(organization_id) or sales_private.can_manage_district(district_key)
);
create policy sales_organization_members_read on public.sales_organization_members for select to authenticated using (
  sales_private.is_owner() or (user_id = auth.uid() and sales_private.active_user())
);
create policy sales_audit_read on public.sales_audit_events for select to authenticated using (sales_private.is_owner());

-- Chunk 1 writes are owner-admin only. Chunk 2 will add scoped organization RPCs.
-- Owner identity itself and audit history cannot be changed via the authenticated API.
do $$
declare t text;
begin
  foreach t in array array['sales_profiles','sales_regions','sales_districts','sales_staff_scopes','sales_studios','sales_shows','sales_organizations','sales_organization_districts','sales_organization_members'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (sales_private.is_owner())', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (sales_private.is_owner()) with check (sales_private.is_owner())', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (sales_private.is_owner())', t || '_owner_delete', t);
  end loop;
end $$;

insert into public.sales_districts(district_key, name) values('dlpc', 'Dysart and La Porte City');
insert into public.sales_shows(show_key, name, district_key, publication_weekdays, publication_time, publishes_on_holidays)
values('morning-kickstart', 'Morning Kickstart', 'dlpc', array[1,2,3,4,5]::smallint[], '05:00:00', true);
-- No regions, studios, regional managers, future shows or customer records are fabricated.
commit;
