do $$
begin
  if not exists (select 1 from pg_type where typname = 'nrcs_edition_status') then
    create type nrcs_edition_status as enum ('draft', 'ready', 'recorded', 'aired', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_rundown_item_type') then
    create type nrcs_rundown_item_type as enum ('story', 'segment', 'script', 'production_note');
  end if;
end $$;

create table if not exists public.nrcs_programs (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_programs_name_present check (length(trim(name)) > 0),
  constraint nrcs_programs_district_name_unique unique (district_key, name)
);

create table if not exists public.nrcs_program_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.nrcs_programs(id) on delete cascade,
  name text not null default 'Default',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_program_templates_name_present check (length(trim(name)) > 0),
  constraint nrcs_program_templates_program_name_unique unique (program_id, name)
);

create table if not exists public.nrcs_program_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.nrcs_program_templates(id) on delete cascade,
  item_type nrcs_rundown_item_type not null,
  title text not null,
  body_html text null,
  segment_kind text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_program_template_items_title_present check (length(trim(title)) > 0)
);

create table if not exists public.nrcs_editions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.nrcs_programs(id) on delete cascade,
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  title text not null,
  air_at timestamptz not null,
  recording_at timestamptz null,
  status nrcs_edition_status not null default 'draft',
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  updated_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_editions_title_present check (length(trim(title)) > 0)
);

create table if not exists public.nrcs_rundown_items (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.nrcs_editions(id) on delete cascade,
  item_type nrcs_rundown_item_type not null,
  sort_order int not null default 0,
  title text not null,
  body_html text null,
  segment_kind text null,
  story_id uuid null references public.nrcs_stories(id) on delete set null,
  copy_version_id uuid null references public.nrcs_copy_versions(id) on delete set null,
  is_checked boolean not null default false,
  carry_source_item_id uuid null references public.nrcs_rundown_items(id) on delete set null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  updated_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_rundown_items_title_present check (length(trim(title)) > 0),
  constraint nrcs_rundown_story_requires_refs check (
    item_type <> 'story' or (story_id is not null and copy_version_id is not null)
  ),
  constraint nrcs_rundown_non_story_no_story_ref check (
    item_type = 'story' or (story_id is null and copy_version_id is null)
  )
);

create index if not exists nrcs_programs_district_name_idx on public.nrcs_programs (district_key, name);
create index if not exists nrcs_editions_program_air_idx on public.nrcs_editions (program_id, air_at);
create index if not exists nrcs_editions_district_air_idx on public.nrcs_editions (district_key, air_at);
create index if not exists nrcs_rundown_items_edition_order_idx on public.nrcs_rundown_items (edition_id, sort_order, created_at);
create index if not exists nrcs_rundown_items_story_idx on public.nrcs_rundown_items (story_id);

drop trigger if exists nrcs_programs_set_updated_at on public.nrcs_programs;
create trigger nrcs_programs_set_updated_at
before update on public.nrcs_programs
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_program_templates_set_updated_at on public.nrcs_program_templates;
create trigger nrcs_program_templates_set_updated_at
before update on public.nrcs_program_templates
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_program_template_items_set_updated_at on public.nrcs_program_template_items;
create trigger nrcs_program_template_items_set_updated_at
before update on public.nrcs_program_template_items
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_editions_set_updated_at on public.nrcs_editions;
create trigger nrcs_editions_set_updated_at
before update on public.nrcs_editions
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_rundown_items_set_updated_at on public.nrcs_rundown_items;
create trigger nrcs_rundown_items_set_updated_at
before update on public.nrcs_rundown_items
for each row execute procedure public.nrcs_set_updated_at();

with district_keys as (
  select district_key from public.nrcs_districts
), seed_programs as (
  select * from (values
    ('Morning Kickstart'),
    ('Noon Nugget'),
    ('Evening Recap')
  ) as p(name)
), inserted_programs as (
  insert into public.nrcs_programs (district_key, name, enabled)
  select d.district_key, p.name, true
  from district_keys d
  cross join seed_programs p
  on conflict (district_key, name) do update set enabled = excluded.enabled
  returning id
), all_programs as (
  select id from public.nrcs_programs
  where name in ('Morning Kickstart', 'Noon Nugget', 'Evening Recap')
), inserted_templates as (
  insert into public.nrcs_program_templates (program_id, name, enabled)
  select id, 'Default', true from all_programs
  on conflict (program_id, name) do update set enabled = excluded.enabled
  returning id
), all_templates as (
  select t.id
  from public.nrcs_program_templates t
  join public.nrcs_programs p on p.id = t.program_id
  where p.name in ('Morning Kickstart', 'Noon Nugget', 'Evening Recap')
    and t.name = 'Default'
), seed_items as (
  select * from (values
    (10, 'script'::nrcs_rundown_item_type, 'Intro', null, '<p></p>'),
    (20, 'segment'::nrcs_rundown_item_type, 'Weather', 'weather', '<p></p>'),
    (30, 'segment'::nrcs_rundown_item_type, 'Sports Scores', 'sports_scores', '<p></p>'),
    (40, 'segment'::nrcs_rundown_item_type, 'Upcoming Sports', 'upcoming_sports', '<p></p>'),
    (50, 'script'::nrcs_rundown_item_type, 'Break', null, '<p></p>'),
    (60, 'script'::nrcs_rundown_item_type, 'Outro', null, '<p></p>')
  ) as i(sort_order, item_type, title, segment_kind, body_html)
)
insert into public.nrcs_program_template_items (template_id, sort_order, item_type, title, segment_kind, body_html)
select t.id, i.sort_order, i.item_type, i.title, i.segment_kind, i.body_html
from all_templates t
cross join seed_items i
where not exists (
  select 1
  from public.nrcs_program_template_items existing
  where existing.template_id = t.id
    and existing.title = i.title
);

alter table public.nrcs_programs enable row level security;
alter table public.nrcs_program_templates enable row level security;
alter table public.nrcs_program_template_items enable row level security;
alter table public.nrcs_editions enable row level security;
alter table public.nrcs_rundown_items enable row level security;

drop policy if exists "NRCS programs editor read" on public.nrcs_programs;
create policy "NRCS programs editor read"
on public.nrcs_programs for select
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS programs editor write" on public.nrcs_programs;
create policy "NRCS programs editor write"
on public.nrcs_programs for all
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS templates editor read" on public.nrcs_program_templates;
create policy "NRCS templates editor read"
on public.nrcs_program_templates for select
using (
  public.nrcs_has_role('editor')
  and exists (
    select 1 from public.nrcs_programs p
    where p.id = program_id and public.nrcs_can_access_district(p.district_key)
  )
);

drop policy if exists "NRCS templates editor write" on public.nrcs_program_templates;
create policy "NRCS templates editor write"
on public.nrcs_program_templates for all
using (
  public.nrcs_has_role('editor')
  and exists (
    select 1 from public.nrcs_programs p
    where p.id = program_id and public.nrcs_can_access_district(p.district_key)
  )
)
with check (
  public.nrcs_has_role('editor')
  and exists (
    select 1 from public.nrcs_programs p
    where p.id = program_id and public.nrcs_can_access_district(p.district_key)
  )
);

drop policy if exists "NRCS template items editor read" on public.nrcs_program_template_items;
create policy "NRCS template items editor read"
on public.nrcs_program_template_items for select
using (
  public.nrcs_has_role('editor')
  and exists (
    select 1
    from public.nrcs_program_templates t
    join public.nrcs_programs p on p.id = t.program_id
    where t.id = template_id and public.nrcs_can_access_district(p.district_key)
  )
);

drop policy if exists "NRCS template items editor write" on public.nrcs_program_template_items;
create policy "NRCS template items editor write"
on public.nrcs_program_template_items for all
using (
  public.nrcs_has_role('editor')
  and exists (
    select 1
    from public.nrcs_program_templates t
    join public.nrcs_programs p on p.id = t.program_id
    where t.id = template_id and public.nrcs_can_access_district(p.district_key)
  )
)
with check (
  public.nrcs_has_role('editor')
  and exists (
    select 1
    from public.nrcs_program_templates t
    join public.nrcs_programs p on p.id = t.program_id
    where t.id = template_id and public.nrcs_can_access_district(p.district_key)
  )
);

drop policy if exists "NRCS editions editor read" on public.nrcs_editions;
create policy "NRCS editions editor read"
on public.nrcs_editions for select
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS editions editor write" on public.nrcs_editions;
create policy "NRCS editions editor write"
on public.nrcs_editions for all
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS rundown items editor read" on public.nrcs_rundown_items;
create policy "NRCS rundown items editor read"
on public.nrcs_rundown_items for select
using (
  public.nrcs_has_role('editor')
  and exists (
    select 1 from public.nrcs_editions e
    where e.id = edition_id and public.nrcs_can_access_district(e.district_key)
  )
);

drop policy if exists "NRCS rundown items editor write" on public.nrcs_rundown_items;
create policy "NRCS rundown items editor write"
on public.nrcs_rundown_items for all
using (
  public.nrcs_has_role('editor')
  and exists (
    select 1 from public.nrcs_editions e
    where e.id = edition_id and public.nrcs_can_access_district(e.district_key)
  )
)
with check (
  public.nrcs_has_role('editor')
  and exists (
    select 1 from public.nrcs_editions e
    where e.id = edition_id and public.nrcs_can_access_district(e.district_key)
  )
);

comment on table public.nrcs_programs is 'Phase 4 district-scoped NRCS programs.';
comment on table public.nrcs_editions is 'Phase 4 scheduled air/recording editions for programs.';
comment on table public.nrcs_rundown_items is 'Phase 4 ordered rundown working document items.';
