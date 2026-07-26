alter table garage_sale_sessions
add column if not exists city text not null default '',
add column if not exists state text not null default '',
add column if not exists zip text not null default '',
add column if not exists map_enabled boolean not null default false;

alter table garage_sale_submissions
add column if not exists latitude numeric null,
add column if not exists longitude numeric null,
add column if not exists geocode_status text not null default 'skipped'
  check (geocode_status in ('pending','success','failed','skipped')),
add column if not exists geocode_error text null,
add column if not exists geocode_place_id text null,
add column if not exists geocoded_address text null,
add column if not exists geocoded_at timestamp null;

create table if not exists garage_sale_submission_dates (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references garage_sale_submissions(id) on delete cascade,
  sale_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (submission_id, sale_date)
);

create index if not exists garage_sale_submission_dates_date_idx
on garage_sale_submission_dates (sale_date);

create index if not exists garage_sale_submission_dates_submission_idx
on garage_sale_submission_dates (submission_id);

drop trigger if exists garage_sale_submission_dates_set_updated_at on garage_sale_submission_dates;
create trigger garage_sale_submission_dates_set_updated_at
before update on garage_sale_submission_dates
for each row execute procedure set_updated_at();

alter table garage_sale_submission_dates enable row level security;

drop policy if exists "Garage sale submission dates public read published" on garage_sale_submission_dates;
create policy "Garage sale submission dates public read published"
on garage_sale_submission_dates for select
using (
  exists (
    select 1
    from garage_sale_submissions
    where garage_sale_submissions.id = garage_sale_submission_dates.submission_id
      and garage_sale_submissions.status = 'published'
  )
);

drop policy if exists "Garage sale submission dates admin full" on garage_sale_submission_dates;
create policy "Garage sale submission dates admin full"
on garage_sale_submission_dates for all
using (is_admin())
with check (is_admin());
