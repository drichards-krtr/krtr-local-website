do $$
begin
  if not exists (select 1 from pg_type where typname = 'nrcs_event_status') then
    create type nrcs_event_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_event_classification_kind') then
    create type nrcs_event_classification_kind as enum ('sport', 'extra_curricular', 'event_type');
  end if;
end $$;

create table if not exists public.nrcs_event_classification_terms (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  kind nrcs_event_classification_kind not null,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_event_classification_terms_name_present check (length(trim(name)) > 0),
  constraint nrcs_event_classification_terms_name_unique unique (district_key, kind, name)
);

create table if not exists public.nrcs_events (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  title text not null,
  body_html text null,
  location_name text not null,
  address text not null,
  city text not null,
  state text not null,
  zip text not null,
  location text null,
  start_at timestamp not null,
  end_at timestamp null,
  image_url text null,
  status nrcs_event_status not null default 'draft',
  classification_term_id uuid null references public.nrcs_event_classification_terms(id) on update cascade on delete set null,
  cms_event_id uuid null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_events_title_present check (length(trim(title)) > 0)
);

create index if not exists nrcs_event_classification_terms_district_kind_name_idx
on public.nrcs_event_classification_terms (district_key, kind, name);

create index if not exists nrcs_events_district_status_start_idx
on public.nrcs_events (district_key, status, start_at desc);

create index if not exists nrcs_events_classification_term_idx
on public.nrcs_events (classification_term_id);

drop trigger if exists nrcs_event_classification_terms_set_updated_at on public.nrcs_event_classification_terms;
create trigger nrcs_event_classification_terms_set_updated_at
before update on public.nrcs_event_classification_terms
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_events_set_updated_at on public.nrcs_events;
create trigger nrcs_events_set_updated_at
before update on public.nrcs_events
for each row execute procedure public.nrcs_set_updated_at();

with district_keys as (
  select district_key from public.nrcs_districts
),
seed_terms(kind, name) as (
  values
    ('sport'::nrcs_event_classification_kind, 'Football'),
    ('sport'::nrcs_event_classification_kind, 'Volleyball'),
    ('sport'::nrcs_event_classification_kind, 'Boys Swimming'),
    ('sport'::nrcs_event_classification_kind, 'Girls Swimming'),
    ('sport'::nrcs_event_classification_kind, 'Boys Track and Field'),
    ('sport'::nrcs_event_classification_kind, 'Girls Track and Field'),
    ('sport'::nrcs_event_classification_kind, 'Boys Cross Country'),
    ('sport'::nrcs_event_classification_kind, 'Girls Cross Country'),
    ('sport'::nrcs_event_classification_kind, 'Boys Tennis'),
    ('sport'::nrcs_event_classification_kind, 'Girls Tennis'),
    ('sport'::nrcs_event_classification_kind, 'Boys Basketball'),
    ('sport'::nrcs_event_classification_kind, 'Girls Basketball'),
    ('sport'::nrcs_event_classification_kind, 'Boys Wrestling'),
    ('sport'::nrcs_event_classification_kind, 'Girls Wrestling'),
    ('sport'::nrcs_event_classification_kind, 'Boys Golf'),
    ('sport'::nrcs_event_classification_kind, 'Girls Golf'),
    ('sport'::nrcs_event_classification_kind, 'Boys Bowling'),
    ('sport'::nrcs_event_classification_kind, 'Girls Bowling'),
    ('sport'::nrcs_event_classification_kind, 'Boys Soccer'),
    ('sport'::nrcs_event_classification_kind, 'Girls Soccer'),
    ('sport'::nrcs_event_classification_kind, 'Baseball'),
    ('sport'::nrcs_event_classification_kind, 'Softball'),
    ('sport'::nrcs_event_classification_kind, 'Dance'),
    ('sport'::nrcs_event_classification_kind, 'Cheer'),
    ('extra_curricular'::nrcs_event_classification_kind, 'Band'),
    ('extra_curricular'::nrcs_event_classification_kind, 'Choir'),
    ('extra_curricular'::nrcs_event_classification_kind, 'Speech'),
    ('extra_curricular'::nrcs_event_classification_kind, 'Esports'),
    ('extra_curricular'::nrcs_event_classification_kind, 'FFA'),
    ('event_type'::nrcs_event_classification_kind, 'City Council'),
    ('event_type'::nrcs_event_classification_kind, 'School Board'),
    ('event_type'::nrcs_event_classification_kind, 'Library'),
    ('event_type'::nrcs_event_classification_kind, 'Museum')
)
insert into public.nrcs_event_classification_terms (district_key, kind, name, enabled)
select district_keys.district_key, seed_terms.kind, seed_terms.name, true
from district_keys
cross join seed_terms
on conflict (district_key, kind, name) do nothing;

alter table public.nrcs_event_classification_terms enable row level security;
alter table public.nrcs_events enable row level security;

drop policy if exists "NRCS classification terms district read" on public.nrcs_event_classification_terms;
create policy "NRCS classification terms district read"
on public.nrcs_event_classification_terms for select
using (public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS classification terms editor full" on public.nrcs_event_classification_terms;
create policy "NRCS classification terms editor full"
on public.nrcs_event_classification_terms for all
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS events district read" on public.nrcs_events;
create policy "NRCS events district read"
on public.nrcs_events for select
using (public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS events contributor insert" on public.nrcs_events;
create policy "NRCS events contributor insert"
on public.nrcs_events for insert
with check (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS events contributor update" on public.nrcs_events;
create policy "NRCS events contributor update"
on public.nrcs_events for update
using (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key));

comment on table public.nrcs_event_classification_terms is
  'District-managed School Activity Manager terms for sports, extra-curriculars, and other event types.';

comment on table public.nrcs_events is
  'NRCS-owned event records. Public CMS receives published display data through a protected sync path.';
