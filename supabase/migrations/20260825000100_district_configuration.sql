create table if not exists public.districts (
  id uuid primary key default gen_random_uuid(),
  district_key text not null unique,
  subdomain text not null unique,
  display_name text not null,
  enabled boolean not null default false,
  primary_contact_name text null,
  primary_contact_email text null,
  primary_contact_phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint districts_key_normalized
    check (district_key = lower(trim(district_key)) and district_key ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint districts_subdomain_normalized
    check (subdomain = lower(trim(subdomain)) and subdomain <> ''),
  constraint districts_contact_email_normalized
    check (primary_contact_email is null or primary_contact_email = lower(trim(primary_contact_email)))
);

insert into public.districts (
  district_key,
  subdomain,
  display_name,
  enabled,
  primary_contact_name,
  primary_contact_email,
  primary_contact_phone
)
values
  ('dlpc', 'dlpc.krtrlocal.tv', 'Dysart-La Porte City', true, null, null, null),
  ('vs', 'vs.krtrlocal.tv', 'Vinton-Shellsburg', false, null, null, null),
  ('bc', 'bc.krtrlocal.tv', 'Benton Community', false, null, null, null)
on conflict (district_key) do update set
  subdomain = excluded.subdomain,
  display_name = excluded.display_name,
  enabled = public.districts.enabled,
  primary_contact_name = coalesce(public.districts.primary_contact_name, excluded.primary_contact_name),
  primary_contact_email = coalesce(public.districts.primary_contact_email, excluded.primary_contact_email),
  primary_contact_phone = coalesce(public.districts.primary_contact_phone, excluded.primary_contact_phone);

do $$
declare
  scoped_table text;
  scoped_tables text[] := array[
    'stories',
    'story_slots',
    'ads',
    'events',
    'alerts',
    'stream_config',
    'stream_schedule',
    'logos',
    'site_pages',
    'seasonal_pages',
    'vote_page_content',
    'vote_candidates',
    'festival_of_trails_content',
    'festival_of_trails_links',
    'nominations',
    'nomination_copy',
    'nomination_submissions',
    'nomination_voting_sessions',
    'garage_sale_sessions',
    'garage_sale_submissions',
    'dailys',
    'footer_settings'
  ];
begin
  foreach scoped_table in array scoped_tables loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = scoped_table
        and column_name = 'district_key'
    ) then
      execute format('alter table public.%I drop constraint if exists %I', scoped_table, scoped_table || '_district_key_check');

      if not exists (
        select 1
        from pg_constraint
        where conname = scoped_table || '_district_key_fkey'
          and conrelid = format('public.%I', scoped_table)::regclass
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (district_key) references public.districts(district_key) on update cascade',
          scoped_table,
          scoped_table || '_district_key_fkey'
        );
      end if;
    end if;
  end loop;
end $$;

drop trigger if exists districts_set_updated_at on public.districts;
create trigger districts_set_updated_at
before update on public.districts
for each row execute procedure public.set_updated_at();

alter table public.districts enable row level security;

drop policy if exists "Districts public read enabled" on public.districts;
create policy "Districts public read enabled"
on public.districts for select
using (enabled = true);

drop policy if exists "Districts admin full" on public.districts;
create policy "Districts admin full"
on public.districts for all
using (public.is_admin())
with check (public.is_admin());

comment on table public.districts is
  'CMS-owned district registry. Districts can be disabled but should not be deleted through CMS workflows.';
