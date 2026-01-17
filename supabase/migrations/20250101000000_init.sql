create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_admin boolean default false,
  created_at timestamp default now()
);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tease text,
  body_markdown text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamp null,
  image_url text null,
  cloudinary_public_id text null,
  cloudinary_width int null,
  cloudinary_height int null,
  mux_asset_id text null,
  mux_playback_id text null,
  mux_status text null,
  created_by uuid null references profiles(id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists story_slots (
  slot text primary key check (slot in ('hero','top1','top2','top3','top4')),
  story_id uuid references stories(id) on delete set null,
  updated_at timestamp default now()
);

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('allsite','homepage','story')),
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  image_url text null,
  link_url text null,
  html text null,
  weight int not null default 1,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  location text null,
  start_at timestamp not null,
  end_at timestamp null,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  link_url text null,
  active boolean not null default false,
  start_at timestamp null,
  end_at timestamp null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function set_created_by()
returns trigger as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stories_set_updated_at on stories;
create trigger stories_set_updated_at
before update on stories
for each row execute procedure set_updated_at();

drop trigger if exists stories_set_created_by on stories;
create trigger stories_set_created_by
before insert on stories
for each row execute procedure set_created_by();

drop trigger if exists ads_set_updated_at on ads;
create trigger ads_set_updated_at
before update on ads
for each row execute procedure set_updated_at();

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
before update on events
for each row execute procedure set_updated_at();

drop trigger if exists alerts_set_updated_at on alerts;
create trigger alerts_set_updated_at
before update on alerts
for each row execute procedure set_updated_at();

drop trigger if exists story_slots_set_updated_at on story_slots;
create trigger story_slots_set_updated_at
before update on story_slots
for each row execute procedure set_updated_at();

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure handle_new_user();

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  );
$$ language sql stable security definer set search_path = public;

alter table profiles enable row level security;
alter table stories enable row level security;
alter table story_slots enable row level security;
alter table ads enable row level security;
alter table events enable row level security;
alter table alerts enable row level security;

drop policy if exists "Profiles admin read" on profiles;
create policy "Profiles admin read"
on profiles for select
using (is_admin());

drop policy if exists "Profiles admin write" on profiles;
create policy "Profiles admin write"
on profiles for all
using (is_admin())
with check (is_admin());

drop policy if exists "Stories public read published" on stories;
create policy "Stories public read published"
on stories for select
using (status = 'published');

drop policy if exists "Stories admin full" on stories;
create policy "Stories admin full"
on stories for all
using (is_admin())
with check (is_admin());

drop policy if exists "Story slots public read" on story_slots;
create policy "Story slots public read"
on story_slots for select
using (true);

drop policy if exists "Story slots admin full" on story_slots;
create policy "Story slots admin full"
on story_slots for all
using (is_admin())
with check (is_admin());

drop policy if exists "Ads public read active" on ads;
create policy "Ads public read active"
on ads for select
using (
  active = true
  and current_date between start_date and end_date
);

drop policy if exists "Ads admin full" on ads;
create policy "Ads admin full"
on ads for all
using (is_admin())
with check (is_admin());

drop policy if exists "Events public read upcoming" on events;
create policy "Events public read upcoming"
on events for select
using (
  status = 'published'
  and start_at >= now() - interval '1 day'
);

drop policy if exists "Events admin full" on events;
create policy "Events admin full"
on events for all
using (is_admin())
with check (is_admin());

drop policy if exists "Alerts public read active window" on alerts;
create policy "Alerts public read active window"
on alerts for select
using (
  active = true
  and (start_at is null or start_at <= now())
  and (end_at is null or end_at >= now())
);

drop policy if exists "Alerts admin full" on alerts;
create policy "Alerts admin full"
on alerts for all
using (is_admin())
with check (is_admin());
