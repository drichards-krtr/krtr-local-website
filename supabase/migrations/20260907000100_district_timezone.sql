alter table public.districts
add column if not exists timezone text not null default 'America/Chicago';

alter table public.districts
drop constraint if exists districts_timezone_present;

alter table public.districts
add constraint districts_timezone_present
check (length(trim(timezone)) > 0);

update public.districts
set timezone = 'America/Chicago'
where timezone is null or length(trim(timezone)) = 0;

comment on column public.districts.timezone is
  'IANA timezone used for district-local scheduling and display.';
