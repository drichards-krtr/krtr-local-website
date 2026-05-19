alter table if exists public.nominations
add column if not exists middle_school_athletes_enabled boolean not null default false;
