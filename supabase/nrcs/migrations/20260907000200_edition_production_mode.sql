do $$
begin
  if not exists (select 1 from pg_type where typname = 'nrcs_edition_production_mode') then
    create type public.nrcs_edition_production_mode as enum ('live', 'recorded');
  end if;
end $$;

alter table public.nrcs_editions
  add column if not exists production_mode public.nrcs_edition_production_mode not null default 'recorded';

create index if not exists nrcs_editions_district_live_air_idx
  on public.nrcs_editions (district_key, production_mode, air_at);
