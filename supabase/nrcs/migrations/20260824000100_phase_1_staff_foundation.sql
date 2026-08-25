create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'nrcs_staff_role') then
    create type nrcs_staff_role as enum ('admin', 'editor', 'contributor');
  end if;
end $$;

create table if not exists public.nrcs_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role nrcs_staff_role not null default 'contributor',
  active boolean not null default true,
  invited_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_staff_invitations_email_normalized
    check (email = lower(trim(email)))
);

create unique index if not exists nrcs_staff_invitations_email_key
on public.nrcs_staff_invitations (email);

create table if not exists public.nrcs_staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text null,
  role nrcs_staff_role not null default 'contributor',
  active boolean not null default true,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_staff_profiles_email_normalized
    check (email = lower(trim(email)))
);

create unique index if not exists nrcs_staff_profiles_email_key
on public.nrcs_staff_profiles (email);

create table if not exists public.nrcs_permission_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references auth.users(id) on delete set null,
  action text not null,
  target_type text null,
  target_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.nrcs_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists nrcs_staff_invitations_set_updated_at on public.nrcs_staff_invitations;
create trigger nrcs_staff_invitations_set_updated_at
before update on public.nrcs_staff_invitations
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_staff_profiles_set_updated_at on public.nrcs_staff_profiles;
create trigger nrcs_staff_profiles_set_updated_at
before update on public.nrcs_staff_profiles
for each row execute procedure public.nrcs_set_updated_at();

create or replace function public.nrcs_current_staff_profile()
returns public.nrcs_staff_profiles as $$
  select p
  from public.nrcs_staff_profiles p
  where p.id = auth.uid()
    and p.active = true
  limit 1;
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_current_role()
returns nrcs_staff_role as $$
  select role
  from public.nrcs_staff_profiles
  where id = auth.uid()
    and active = true
  limit 1;
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_is_admin()
returns boolean as $$
  select exists (
    select 1
    from public.nrcs_staff_profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_has_role(required_role nrcs_staff_role)
returns boolean as $$
  select case
    when public.nrcs_current_role() = 'admin' then true
    when required_role = 'contributor' and public.nrcs_current_role() in ('editor', 'contributor') then true
    when required_role = 'editor' and public.nrcs_current_role() = 'editor' then true
    else false
  end;
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

  update public.nrcs_staff_invitations
  set accepted_at = coalesce(accepted_at, now())
  where id = invite.id;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists nrcs_on_auth_user_created on auth.users;
create trigger nrcs_on_auth_user_created
after insert on auth.users
for each row execute procedure public.nrcs_handle_new_user();

alter table public.nrcs_staff_invitations enable row level security;
alter table public.nrcs_staff_profiles enable row level security;
alter table public.nrcs_permission_audit_events enable row level security;

drop policy if exists "NRCS staff profiles read own" on public.nrcs_staff_profiles;
create policy "NRCS staff profiles read own"
on public.nrcs_staff_profiles for select
using (id = auth.uid() and active = true);

drop policy if exists "NRCS staff profiles admin full" on public.nrcs_staff_profiles;
create policy "NRCS staff profiles admin full"
on public.nrcs_staff_profiles for all
using (public.nrcs_is_admin())
with check (public.nrcs_is_admin());

drop policy if exists "NRCS staff invitations admin full" on public.nrcs_staff_invitations;
create policy "NRCS staff invitations admin full"
on public.nrcs_staff_invitations for all
using (public.nrcs_is_admin())
with check (public.nrcs_is_admin());

drop policy if exists "NRCS permission audit admin read" on public.nrcs_permission_audit_events;
create policy "NRCS permission audit admin read"
on public.nrcs_permission_audit_events for select
using (public.nrcs_is_admin());

drop policy if exists "NRCS permission audit active staff insert" on public.nrcs_permission_audit_events;
create policy "NRCS permission audit active staff insert"
on public.nrcs_permission_audit_events for insert
with check (public.nrcs_has_role('contributor'));

comment on table public.nrcs_staff_invitations is
  'NRCS invite/allowlist table. Auth users only receive staff profiles when their normalized email has an active invitation.';

comment on table public.nrcs_staff_profiles is
  'NRCS staff profile and role table keyed to Supabase auth.users. Deactivation blocks app access without deleting auth identity.';
