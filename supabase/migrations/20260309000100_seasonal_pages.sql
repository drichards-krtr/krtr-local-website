create table if not exists seasonal_pages (
  slug text primary key check (slug in ('vote', 'festival-of-trails')),
  title text not null,
  nav_label text not null,
  nav_enabled boolean not null default false,
  updated_at timestamp not null default now()
);

insert into seasonal_pages (slug, title, nav_label, nav_enabled)
values
  ('vote', 'VOTE', 'VOTE', false),
  ('festival-of-trails', 'Festival of Trails', 'Festival of Trails', false)
on conflict (slug) do nothing;

create table if not exists vote_jurisdictions (
  slug text primary key check (
    slug in (
      'union-community-school-district-school-board',
      'dysart',
      'la-porte-city',
      'black-hawk-county',
      'tama-county',
      'benton-county'
    )
  ),
  label text not null,
  seats_open integer not null default 0 check (seats_open >= 0),
  sort_order integer not null default 1
);

insert into vote_jurisdictions (slug, label, seats_open, sort_order)
values
  ('union-community-school-district-school-board', 'Union Community School District School Board', 0, 1),
  ('dysart', 'Dysart', 0, 2),
  ('la-porte-city', 'La Porte City', 0, 3),
  ('black-hawk-county', 'Black Hawk County', 0, 4),
  ('tama-county', 'Tama County', 0, 5),
  ('benton-county', 'Benton County', 0, 6)
on conflict (slug) do nothing;

create table if not exists vote_seats (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_slug text not null references vote_jurisdictions(slug) on delete cascade,
  seat_key text not null,
  seat_name text not null default '',
  term_years integer null check (term_years > 0),
  sort_order integer not null default 1,
  updated_at timestamp not null default now(),
  unique (jurisdiction_slug, seat_key)
);

create index if not exists vote_seats_jurisdiction_idx
on vote_seats (jurisdiction_slug, sort_order, seat_key);

create table if not exists vote_candidates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_slug text not null references vote_jurisdictions(slug) on delete cascade,
  seat_id uuid null references vote_seats(id) on delete set null,
  candidate_name text not null,
  photo_url text null,
  link_1_url text null,
  link_1_text text null,
  link_2_url text null,
  link_2_text text null,
  sort_order integer not null default 1,
  updated_at timestamp not null default now()
);

create index if not exists vote_candidates_jurisdiction_idx
on vote_candidates (jurisdiction_slug, sort_order, candidate_name);

create table if not exists festival_of_trails_content (
  id integer primary key check (id = 1),
  body_markdown text not null default '',
  photo_url text null,
  photo_active boolean not null default false,
  video_url text null,
  video_active boolean not null default false,
  updated_at timestamp not null default now()
);

insert into festival_of_trails_content (id, body_markdown, photo_active, video_active)
values (1, '', false, false)
on conflict (id) do nothing;

create table if not exists festival_of_trails_links (
  id uuid primary key default gen_random_uuid(),
  link_text text not null,
  link_url text not null,
  priority integer not null check (priority > 0),
  updated_at timestamp not null default now(),
  unique (priority)
);

drop trigger if exists seasonal_pages_set_updated_at on seasonal_pages;
create trigger seasonal_pages_set_updated_at
before update on seasonal_pages
for each row execute procedure set_updated_at();

drop trigger if exists vote_seats_set_updated_at on vote_seats;
create trigger vote_seats_set_updated_at
before update on vote_seats
for each row execute procedure set_updated_at();

drop trigger if exists vote_candidates_set_updated_at on vote_candidates;
create trigger vote_candidates_set_updated_at
before update on vote_candidates
for each row execute procedure set_updated_at();

drop trigger if exists festival_of_trails_content_set_updated_at on festival_of_trails_content;
create trigger festival_of_trails_content_set_updated_at
before update on festival_of_trails_content
for each row execute procedure set_updated_at();

drop trigger if exists festival_of_trails_links_set_updated_at on festival_of_trails_links;
create trigger festival_of_trails_links_set_updated_at
before update on festival_of_trails_links
for each row execute procedure set_updated_at();

alter table seasonal_pages enable row level security;
alter table vote_jurisdictions enable row level security;
alter table vote_seats enable row level security;
alter table vote_candidates enable row level security;
alter table festival_of_trails_content enable row level security;
alter table festival_of_trails_links enable row level security;

drop policy if exists "Seasonal pages public read" on seasonal_pages;
create policy "Seasonal pages public read"
on seasonal_pages for select
using (true);

drop policy if exists "Vote jurisdictions public read" on vote_jurisdictions;
create policy "Vote jurisdictions public read"
on vote_jurisdictions for select
using (true);

drop policy if exists "Vote seats public read" on vote_seats;
create policy "Vote seats public read"
on vote_seats for select
using (true);

drop policy if exists "Vote candidates public read" on vote_candidates;
create policy "Vote candidates public read"
on vote_candidates for select
using (true);

drop policy if exists "Festival content public read" on festival_of_trails_content;
create policy "Festival content public read"
on festival_of_trails_content for select
using (true);

drop policy if exists "Festival links public read" on festival_of_trails_links;
create policy "Festival links public read"
on festival_of_trails_links for select
using (true);

drop policy if exists "Seasonal pages admin full" on seasonal_pages;
create policy "Seasonal pages admin full"
on seasonal_pages for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Vote jurisdictions admin full" on vote_jurisdictions;
create policy "Vote jurisdictions admin full"
on vote_jurisdictions for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Vote seats admin full" on vote_seats;
create policy "Vote seats admin full"
on vote_seats for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Vote candidates admin full" on vote_candidates;
create policy "Vote candidates admin full"
on vote_candidates for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Festival content admin full" on festival_of_trails_content;
create policy "Festival content admin full"
on festival_of_trails_content for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Festival links admin full" on festival_of_trails_links;
create policy "Festival links admin full"
on festival_of_trails_links for all
using (public.is_admin())
with check (public.is_admin());
