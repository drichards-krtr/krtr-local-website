-- Add first-class district support across content, scheduling, and seasonal systems.

-- stories / story slots
alter table stories
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

drop index if exists stories_slug_unique_idx;
create unique index if not exists stories_district_slug_unique_idx
on stories (district_key, slug)
where slug is not null;

create index if not exists stories_district_status_published_idx
on stories (district_key, status, published_at desc);

alter table story_slots
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table story_slots
drop constraint if exists story_slots_pkey;

alter table story_slots
add primary key (district_key, slot);

create index if not exists story_slots_district_story_idx
on story_slots (district_key, story_id);

alter table stories
drop constraint if exists stories_tags_allowed;

-- ads / events / alerts
alter table ads
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists ads_district_placement_dates_idx
on ads (district_key, placement, active, start_date, end_date);

alter table events
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists events_district_status_start_idx
on events (district_key, status, start_at);

alter table alerts
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists alerts_district_active_idx
on alerts (district_key, active, created_at desc);

-- stream config / schedule
alter table if exists stream_config
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists stream_config_district_updated_idx
on stream_config (district_key, updated_at desc);

alter table stream_schedule
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists stream_schedule_district_day_start_idx
on stream_schedule (district_key, day_of_week, start_time);

-- logos
alter table logos
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

drop index if exists logos_single_default_idx;
create unique index if not exists logos_district_default_idx
on logos (district_key)
where is_default = true;

create index if not exists logos_district_dates_idx
on logos (district_key, active, start_date, end_date);

-- site pages
alter table site_pages
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table site_pages
drop constraint if exists site_pages_pkey;

alter table site_pages
add primary key (district_key, slug);

-- seasonal pages
alter table seasonal_pages
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table seasonal_pages
drop constraint if exists seasonal_pages_pkey;

alter table seasonal_pages
add primary key (district_key, slug);

-- vote page content / candidates
alter table vote_page_content
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table vote_page_content
drop constraint if exists vote_page_content_pkey;

alter table vote_page_content
add primary key (district_key, id);

alter table vote_candidates
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists vote_candidates_district_jurisdiction_idx
on vote_candidates (district_key, jurisdiction_name, candidate_name);

alter table vote_jurisdictions
drop constraint if exists vote_jurisdictions_slug_check;

alter table vote_jurisdictions
add constraint vote_jurisdictions_slug_check
check (
  slug in (
    'union-community-school-district-school-board',
    'dysart',
    'la-porte-city',
    'black-hawk-county',
    'tama-county',
    'benton-county',
    'vinton-shellsburg-school-board',
    'vinton',
    'shellsburg',
    'benton-community-school-board',
    'benton-community'
  )
);

insert into vote_jurisdictions (slug, label, seats_open, sort_order)
values
  ('vinton-shellsburg-school-board', 'Vinton-Shellsburg School Board', 0, 7),
  ('vinton', 'Vinton', 0, 8),
  ('shellsburg', 'Shellsburg', 0, 9),
  ('benton-community-school-board', 'Benton Community School Board', 0, 10),
  ('benton-community', 'Benton Community', 0, 11)
on conflict (slug) do nothing;

-- Festival of Trails stays DLPC-only, but content itself still needs district scoping.
alter table festival_of_trails_content
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table festival_of_trails_content
drop constraint if exists festival_of_trails_content_pkey;

alter table festival_of_trails_content
add primary key (district_key, id);

alter table festival_of_trails_links
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table festival_of_trails_links
drop constraint if exists festival_of_trails_links_priority_key;

alter table festival_of_trails_links
add constraint festival_of_trails_links_district_priority_key
unique (district_key, priority);

create index if not exists festival_of_trails_links_district_priority_idx
on festival_of_trails_links (district_key, priority);

-- nominations
alter table nominations
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

drop index if exists nominations_one_force_open_idx;
create unique index if not exists nominations_district_force_open_idx
on nominations (district_key, status_override)
where status_override = 'force_open';

create or replace function prevent_nomination_overlap()
returns trigger as $$
begin
  if exists (
    select 1
    from nominations n
    where n.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and n.district_key = new.district_key
      and daterange(n.open_date, n.close_date, '[]') && daterange(new.open_date, new.close_date, '[]')
  ) then
    raise exception 'Nomination date range overlaps an existing nomination.'
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

alter table nomination_copy
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

alter table nomination_copy
drop constraint if exists nomination_copy_pkey;

alter table nomination_copy
add primary key (district_key, category);

alter table nomination_submissions
add column if not exists district_key text not null default 'dlpc'
check (district_key in ('dlpc', 'vs', 'bc'));

create index if not exists nomination_submissions_district_submitted_idx
on nomination_submissions (district_key, submitted_at desc);
