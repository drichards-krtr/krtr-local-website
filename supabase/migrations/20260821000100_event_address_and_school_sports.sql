alter table events
add column if not exists location_name text null,
add column if not exists address text null,
add column if not exists city text null,
add column if not exists state text null,
add column if not exists zip text null,
add column if not exists is_school_sports boolean not null default false;

create index if not exists events_district_status_city_start_idx
on events (district_key, status, city, start_at);

create index if not exists events_district_school_sports_start_idx
on events (district_key, is_school_sports, start_at);
