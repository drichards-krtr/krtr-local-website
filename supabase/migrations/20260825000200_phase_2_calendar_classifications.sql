do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_classification_kind') then
    create type event_classification_kind as enum ('sport', 'extra_curricular', 'event_type');
  end if;
end $$;

alter table public.events
add column if not exists body_html text null,
add column if not exists nrcs_source_id uuid null;

create table if not exists public.event_classification_terms (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.districts(district_key) on update cascade,
  kind event_classification_kind not null,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_classification_terms_name_present check (length(trim(name)) > 0),
  constraint event_classification_terms_name_unique unique (district_key, kind, name)
);

create table if not exists public.event_classification_assignments (
  event_id uuid primary key references public.events(id) on delete cascade,
  term_id uuid not null references public.event_classification_terms(id) on update cascade
);

create index if not exists events_district_status_start_id_idx
on public.events (district_key, status, start_at, id);

alter table public.events
drop constraint if exists events_nrcs_source_id_key;

alter table public.events
add constraint events_nrcs_source_id_key unique (nrcs_source_id);

create index if not exists event_classification_terms_district_kind_name_idx
on public.event_classification_terms (district_key, kind, name);

create index if not exists event_classification_assignments_term_event_idx
on public.event_classification_assignments (term_id, event_id);

update public.events
set body_html = trim(
  both from concat(
    case
      when nullif(trim(description), '') is null then ''
      else '<p>' ||
        replace(replace(replace(trim(description), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
        '</p>'
    end,
    case
      when nullif(trim(link_1_url), '') is null then ''
      else '<p><a href="' ||
        replace(replace(replace(trim(link_1_url), '&', '&amp;'), '<', '&lt;'), '"', '&quot;') ||
        '">' ||
        replace(replace(replace(coalesce(nullif(trim(link_1_text), ''), trim(link_1_url)), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
        '</a></p>'
    end,
    case
      when nullif(trim(link_2_url), '') is null then ''
      else '<p><a href="' ||
        replace(replace(replace(trim(link_2_url), '&', '&amp;'), '<', '&lt;'), '"', '&quot;') ||
        '">' ||
        replace(replace(replace(coalesce(nullif(trim(link_2_text), ''), trim(link_2_url)), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
        '</a></p>'
    end
  )
)
where body_html is null
  and (
    nullif(trim(description), '') is not null
    or nullif(trim(link_1_url), '') is not null
    or nullif(trim(link_2_url), '') is not null
  );

drop trigger if exists event_classification_terms_set_updated_at on public.event_classification_terms;
create trigger event_classification_terms_set_updated_at
before update on public.event_classification_terms
for each row execute procedure public.set_updated_at();

alter table public.event_classification_terms enable row level security;
alter table public.event_classification_assignments enable row level security;

drop policy if exists "Event classification terms public read" on public.event_classification_terms;
create policy "Event classification terms public read"
on public.event_classification_terms for select
using (true);

drop policy if exists "Event classification terms admin full" on public.event_classification_terms;
create policy "Event classification terms admin full"
on public.event_classification_terms for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Event classification assignments public read" on public.event_classification_assignments;
create policy "Event classification assignments public read"
on public.event_classification_assignments for select
using (true);

drop policy if exists "Event classification assignments admin full" on public.event_classification_assignments;
create policy "Event classification assignments admin full"
on public.event_classification_assignments for all
using (public.is_admin())
with check (public.is_admin());

with district_keys as (
  select district_key from public.districts
),
seed_terms(kind, name) as (
  values
    ('sport'::event_classification_kind, 'Football'),
    ('sport'::event_classification_kind, 'Volleyball'),
    ('sport'::event_classification_kind, 'Boys Swimming'),
    ('sport'::event_classification_kind, 'Girls Swimming'),
    ('sport'::event_classification_kind, 'Boys Track and Field'),
    ('sport'::event_classification_kind, 'Girls Track and Field'),
    ('sport'::event_classification_kind, 'Boys Cross Country'),
    ('sport'::event_classification_kind, 'Girls Cross Country'),
    ('sport'::event_classification_kind, 'Boys Tennis'),
    ('sport'::event_classification_kind, 'Girls Tennis'),
    ('sport'::event_classification_kind, 'Boys Basketball'),
    ('sport'::event_classification_kind, 'Girls Basketball'),
    ('sport'::event_classification_kind, 'Boys Wrestling'),
    ('sport'::event_classification_kind, 'Girls Wrestling'),
    ('sport'::event_classification_kind, 'Boys Golf'),
    ('sport'::event_classification_kind, 'Girls Golf'),
    ('sport'::event_classification_kind, 'Boys Bowling'),
    ('sport'::event_classification_kind, 'Girls Bowling'),
    ('sport'::event_classification_kind, 'Boys Soccer'),
    ('sport'::event_classification_kind, 'Girls Soccer'),
    ('sport'::event_classification_kind, 'Baseball'),
    ('sport'::event_classification_kind, 'Softball'),
    ('sport'::event_classification_kind, 'Dance'),
    ('sport'::event_classification_kind, 'Cheer'),
    ('extra_curricular'::event_classification_kind, 'Band'),
    ('extra_curricular'::event_classification_kind, 'Choir'),
    ('extra_curricular'::event_classification_kind, 'Speech'),
    ('extra_curricular'::event_classification_kind, 'Esports'),
    ('extra_curricular'::event_classification_kind, 'FFA'),
    ('event_type'::event_classification_kind, 'City Council'),
    ('event_type'::event_classification_kind, 'School Board'),
    ('event_type'::event_classification_kind, 'Library'),
    ('event_type'::event_classification_kind, 'Museum')
)
insert into public.event_classification_terms (district_key, kind, name, enabled)
select district_keys.district_key, seed_terms.kind, seed_terms.name, true
from district_keys
cross join seed_terms
on conflict (district_key, kind, name) do nothing;

comment on table public.event_classification_terms is
  'CMS display copy of district-managed NRCS event classification terms.';

comment on table public.event_classification_assignments is
  'At most one classification term assigned to a public calendar event.';
