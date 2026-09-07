alter table public.nrcs_districts
add column if not exists timezone text not null default 'America/Chicago';

alter table public.nrcs_districts
drop constraint if exists nrcs_districts_timezone_present;

alter table public.nrcs_districts
add constraint nrcs_districts_timezone_present
check (length(trim(timezone)) > 0);

update public.nrcs_districts
set timezone = 'America/Chicago'
where timezone is null or length(trim(timezone)) = 0;

comment on column public.nrcs_districts.timezone is
  'IANA timezone mirrored from CMS district configuration.';
