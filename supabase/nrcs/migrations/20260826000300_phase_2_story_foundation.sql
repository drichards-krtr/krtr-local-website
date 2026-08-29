do $$
begin
  if not exists (select 1 from pg_type where typname = 'nrcs_story_lifecycle_state') then
    create type nrcs_story_lifecycle_state as enum ('idea', 'reporting', 'ready', 'active', 'dormant', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_copy_stream_type') then
    create type nrcs_copy_stream_type as enum ('web', 'rundown', 'social');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_web_output_status') then
    create type nrcs_web_output_status as enum ('draft', 'scheduled', 'published', 'unpublished');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_tag_type') then
    create type nrcs_tag_type as enum ('place', 'organization', 'person', 'topic', 'event_series', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_source_type') then
    create type nrcs_source_type as enum ('person', 'document', 'web', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_asset_type') then
    create type nrcs_asset_type as enum ('image', 'graphic', 'video', 'document', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_review_flag_status') then
    create type nrcs_review_flag_status as enum ('open', 'resolved');
  end if;
end $$;

create table if not exists public.nrcs_categories (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  name text not null,
  slug text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_categories_name_present check (length(trim(name)) > 0),
  constraint nrcs_categories_slug_normalized check (slug = lower(trim(slug)) and slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint nrcs_categories_slug_unique unique (district_key, slug)
);

create table if not exists public.nrcs_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tag_type nrcs_tag_type not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_tags_name_present check (length(trim(name)) > 0),
  constraint nrcs_tags_slug_normalized check (slug = lower(trim(slug)) and slug ~ '^[a-z0-9][a-z0-9-]*$')
);

create table if not exists public.nrcs_tag_aliases (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.nrcs_tags(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  constraint nrcs_tag_aliases_alias_present check (length(trim(alias)) > 0),
  constraint nrcs_tag_aliases_unique unique (tag_id, alias)
);

create table if not exists public.nrcs_stories (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  title text not null,
  lifecycle_state nrcs_story_lifecycle_state not null default 'idea',
  category_id uuid null references public.nrcs_categories(id) on delete set null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  updated_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_stories_title_present check (length(trim(title)) > 0)
);

create table if not exists public.nrcs_story_facts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  body_html text not null default '',
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  updated_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nrcs_copy_streams (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  stream_type nrcs_copy_stream_type not null,
  needs_review boolean not null default false,
  review_reason text null,
  current_version_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_copy_streams_one_per_type unique (story_id, stream_type)
);

create table if not exists public.nrcs_copy_versions (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.nrcs_copy_streams(id) on delete cascade,
  version_number int not null,
  headline text null,
  body_html text not null default '',
  information_changed boolean not null default false,
  created_from_version_id uuid null references public.nrcs_copy_versions(id) on delete set null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint nrcs_copy_versions_number_unique unique (stream_id, version_number)
);

alter table public.nrcs_copy_streams
drop constraint if exists nrcs_copy_streams_current_version_fk;

alter table public.nrcs_copy_streams
add constraint nrcs_copy_streams_current_version_fk
foreign key (current_version_id) references public.nrcs_copy_versions(id) on delete set null;

create table if not exists public.nrcs_review_flags (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  copy_stream_id uuid null references public.nrcs_copy_streams(id) on delete cascade,
  reason text not null,
  status nrcs_review_flag_status not null default 'open',
  resolved_at timestamptz null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nrcs_story_tags (
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  tag_id uuid not null references public.nrcs_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, tag_id)
);

create table if not exists public.nrcs_sources (
  id uuid primary key default gen_random_uuid(),
  source_type nrcs_source_type not null,
  name text not null,
  organization text null,
  role_title text null,
  email text null,
  phone text null,
  url text null,
  notes text null,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_sources_name_present check (length(trim(name)) > 0)
);

create table if not exists public.nrcs_source_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.nrcs_sources(id) on delete cascade,
  storage_bucket text not null default 'source-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text null,
  file_size bigint null,
  uploaded_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint nrcs_source_documents_path_unique unique (storage_bucket, storage_path)
);

create table if not exists public.nrcs_story_sources (
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  source_id uuid not null references public.nrcs_sources(id) on delete cascade,
  interaction_notes text null,
  created_at timestamptz not null default now(),
  primary key (story_id, source_id)
);

create table if not exists public.nrcs_assets (
  id uuid primary key default gen_random_uuid(),
  asset_type nrcs_asset_type not null,
  title text not null,
  cloudinary_public_id text null,
  cloudinary_url text null,
  mux_asset_id text null,
  mux_playback_id text null,
  storage_bucket text null,
  storage_path text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_assets_title_present check (length(trim(title)) > 0)
);

create table if not exists public.nrcs_story_assets (
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  asset_id uuid not null references public.nrcs_assets(id) on delete cascade,
  relationship text not null default 'supporting',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (story_id, asset_id)
);

create table if not exists public.nrcs_web_outputs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  copy_version_id uuid null references public.nrcs_copy_versions(id) on delete set null,
  status nrcs_web_output_status not null default 'draft',
  slug text null,
  hero_asset_id uuid null references public.nrcs_assets(id) on delete set null,
  seo_title text null,
  seo_description text null,
  scheduled_at timestamptz null,
  published_at timestamptz null,
  cms_story_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nrcs_story_events (
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  event_id uuid not null references public.nrcs_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, event_id)
);

create table if not exists public.nrcs_related_stories (
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  related_story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, related_story_id),
  constraint nrcs_related_stories_not_self check (story_id <> related_story_id)
);

create index if not exists nrcs_stories_district_state_updated_idx
on public.nrcs_stories (district_key, lifecycle_state, updated_at desc);

create index if not exists nrcs_copy_streams_story_idx
on public.nrcs_copy_streams (story_id, stream_type);

create index if not exists nrcs_copy_versions_stream_created_idx
on public.nrcs_copy_versions (stream_id, created_at desc);

create index if not exists nrcs_review_flags_story_status_idx
on public.nrcs_review_flags (story_id, status, created_at desc);

create index if not exists nrcs_sources_type_name_idx
on public.nrcs_sources (source_type, name);

create index if not exists nrcs_assets_type_created_idx
on public.nrcs_assets (asset_type, created_at desc);

create index if not exists nrcs_web_outputs_story_status_idx
on public.nrcs_web_outputs (story_id, status);

create index if not exists nrcs_story_events_event_idx
on public.nrcs_story_events (event_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nrcs_categories',
    'nrcs_tags',
    'nrcs_tag_aliases',
    'nrcs_stories',
    'nrcs_story_facts',
    'nrcs_copy_streams',
    'nrcs_copy_versions',
    'nrcs_review_flags',
    'nrcs_story_tags',
    'nrcs_sources',
    'nrcs_source_documents',
    'nrcs_story_sources',
    'nrcs_assets',
    'nrcs_story_assets',
    'nrcs_web_outputs',
    'nrcs_story_events',
    'nrcs_related_stories'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    if table_name not in ('nrcs_copy_versions', 'nrcs_tag_aliases', 'nrcs_source_documents', 'nrcs_story_tags', 'nrcs_story_sources', 'nrcs_story_assets', 'nrcs_story_events', 'nrcs_related_stories') then
      execute format('create trigger %I_set_updated_at before update on public.%I for each row execute procedure public.nrcs_set_updated_at()', table_name, table_name);
    end if;
  end loop;
end $$;

alter table public.nrcs_categories enable row level security;
alter table public.nrcs_tags enable row level security;
alter table public.nrcs_tag_aliases enable row level security;
alter table public.nrcs_stories enable row level security;
alter table public.nrcs_story_facts enable row level security;
alter table public.nrcs_copy_streams enable row level security;
alter table public.nrcs_copy_versions enable row level security;
alter table public.nrcs_review_flags enable row level security;
alter table public.nrcs_story_tags enable row level security;
alter table public.nrcs_sources enable row level security;
alter table public.nrcs_source_documents enable row level security;
alter table public.nrcs_story_sources enable row level security;
alter table public.nrcs_assets enable row level security;
alter table public.nrcs_story_assets enable row level security;
alter table public.nrcs_web_outputs enable row level security;
alter table public.nrcs_story_events enable row level security;
alter table public.nrcs_related_stories enable row level security;

create or replace function public.nrcs_can_read_story(requested_story_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.nrcs_stories s
    where s.id = requested_story_id
      and public.nrcs_can_access_district(s.district_key)
      and (
        public.nrcs_has_role('editor')
        or s.created_by = auth.uid()
        or s.lifecycle_state = 'active'
      )
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_can_write_story(requested_story_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.nrcs_stories s
    where s.id = requested_story_id
      and public.nrcs_can_access_district(s.district_key)
      and (
        public.nrcs_has_role('editor')
        or s.created_by = auth.uid()
      )
  );
$$ language sql stable security definer set search_path = public;

drop policy if exists "NRCS categories district read" on public.nrcs_categories;
create policy "NRCS categories district read"
on public.nrcs_categories for select
using (public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS categories editor full" on public.nrcs_categories;
create policy "NRCS categories editor full"
on public.nrcs_categories for all
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS tags staff read" on public.nrcs_tags;
create policy "NRCS tags staff read"
on public.nrcs_tags for select
using (public.nrcs_has_role('contributor'));

drop policy if exists "NRCS tags editor full" on public.nrcs_tags;
create policy "NRCS tags editor full"
on public.nrcs_tags for all
using (public.nrcs_has_role('editor'))
with check (public.nrcs_has_role('editor'));

drop policy if exists "NRCS tag aliases staff read" on public.nrcs_tag_aliases;
create policy "NRCS tag aliases staff read"
on public.nrcs_tag_aliases for select
using (public.nrcs_has_role('contributor'));

drop policy if exists "NRCS tag aliases editor full" on public.nrcs_tag_aliases;
create policy "NRCS tag aliases editor full"
on public.nrcs_tag_aliases for all
using (public.nrcs_has_role('editor'))
with check (public.nrcs_has_role('editor'));

drop policy if exists "NRCS stories role read" on public.nrcs_stories;
create policy "NRCS stories role read"
on public.nrcs_stories for select
using (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
    or lifecycle_state = 'active'
  )
);

drop policy if exists "NRCS stories contributor insert" on public.nrcs_stories;
create policy "NRCS stories contributor insert"
on public.nrcs_stories for insert
with check (
  public.nrcs_has_role('contributor')
  and public.nrcs_can_access_district(district_key)
  and created_by = auth.uid()
);

drop policy if exists "NRCS stories role update" on public.nrcs_stories;
create policy "NRCS stories role update"
on public.nrcs_stories for update
using (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
  )
)
with check (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
  )
);

drop policy if exists "NRCS story facts read" on public.nrcs_story_facts;
create policy "NRCS story facts read"
on public.nrcs_story_facts for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS story facts write" on public.nrcs_story_facts;
create policy "NRCS story facts write"
on public.nrcs_story_facts for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS copy streams read" on public.nrcs_copy_streams;
create policy "NRCS copy streams read"
on public.nrcs_copy_streams for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS copy streams write" on public.nrcs_copy_streams;
create policy "NRCS copy streams write"
on public.nrcs_copy_streams for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS copy versions read" on public.nrcs_copy_versions;
create policy "NRCS copy versions read"
on public.nrcs_copy_versions for select
using (
  exists (
    select 1
    from public.nrcs_copy_streams s
    where s.id = stream_id
      and public.nrcs_can_read_story(s.story_id)
  )
);

drop policy if exists "NRCS copy versions insert" on public.nrcs_copy_versions;
create policy "NRCS copy versions insert"
on public.nrcs_copy_versions for insert
with check (
  exists (
    select 1
    from public.nrcs_copy_streams s
    where s.id = stream_id
      and public.nrcs_can_write_story(s.story_id)
  )
);

drop policy if exists "NRCS review flags read" on public.nrcs_review_flags;
create policy "NRCS review flags read"
on public.nrcs_review_flags for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS review flags write" on public.nrcs_review_flags;
create policy "NRCS review flags write"
on public.nrcs_review_flags for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS story tags read" on public.nrcs_story_tags;
create policy "NRCS story tags read"
on public.nrcs_story_tags for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS story tags write" on public.nrcs_story_tags;
create policy "NRCS story tags write"
on public.nrcs_story_tags for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS sources staff read" on public.nrcs_sources;
create policy "NRCS sources staff read"
on public.nrcs_sources for select
using (public.nrcs_has_role('contributor'));

drop policy if exists "NRCS sources contributor insert" on public.nrcs_sources;
create policy "NRCS sources contributor insert"
on public.nrcs_sources for insert
with check (public.nrcs_has_role('contributor') and created_by = auth.uid());

drop policy if exists "NRCS sources owner editor update" on public.nrcs_sources;
create policy "NRCS sources owner editor update"
on public.nrcs_sources for update
using (public.nrcs_has_role('editor') or created_by = auth.uid())
with check (public.nrcs_has_role('editor') or created_by = auth.uid());

drop policy if exists "NRCS source documents staff read" on public.nrcs_source_documents;
create policy "NRCS source documents staff read"
on public.nrcs_source_documents for select
using (public.nrcs_has_role('contributor'));

drop policy if exists "NRCS source documents contributor insert" on public.nrcs_source_documents;
create policy "NRCS source documents contributor insert"
on public.nrcs_source_documents for insert
with check (public.nrcs_has_role('contributor'));

drop policy if exists "NRCS story sources read" on public.nrcs_story_sources;
create policy "NRCS story sources read"
on public.nrcs_story_sources for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS story sources write" on public.nrcs_story_sources;
create policy "NRCS story sources write"
on public.nrcs_story_sources for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS assets staff read" on public.nrcs_assets;
create policy "NRCS assets staff read"
on public.nrcs_assets for select
using (public.nrcs_has_role('contributor'));

drop policy if exists "NRCS assets contributor insert" on public.nrcs_assets;
create policy "NRCS assets contributor insert"
on public.nrcs_assets for insert
with check (public.nrcs_has_role('contributor') and created_by = auth.uid());

drop policy if exists "NRCS assets owner editor update" on public.nrcs_assets;
create policy "NRCS assets owner editor update"
on public.nrcs_assets for update
using (public.nrcs_has_role('editor') or created_by = auth.uid())
with check (public.nrcs_has_role('editor') or created_by = auth.uid());

drop policy if exists "NRCS story assets read" on public.nrcs_story_assets;
create policy "NRCS story assets read"
on public.nrcs_story_assets for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS story assets write" on public.nrcs_story_assets;
create policy "NRCS story assets write"
on public.nrcs_story_assets for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS web outputs read" on public.nrcs_web_outputs;
create policy "NRCS web outputs read"
on public.nrcs_web_outputs for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS web outputs write" on public.nrcs_web_outputs;
create policy "NRCS web outputs write"
on public.nrcs_web_outputs for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS story events read" on public.nrcs_story_events;
create policy "NRCS story events read"
on public.nrcs_story_events for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS story events write" on public.nrcs_story_events;
create policy "NRCS story events write"
on public.nrcs_story_events for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS related stories read" on public.nrcs_related_stories;
create policy "NRCS related stories read"
on public.nrcs_related_stories for select
using (public.nrcs_can_read_story(story_id) and public.nrcs_can_read_story(related_story_id));

drop policy if exists "NRCS related stories write" on public.nrcs_related_stories;
create policy "NRCS related stories write"
on public.nrcs_related_stories for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

comment on table public.nrcs_stories is
  'Canonical NRCS Story records. Lifecycle is editorial state; publication status lives on outputs.';

comment on table public.nrcs_copy_versions is
  'Immutable saved copy versions. Edits create new rows rather than mutating prior versions.';

comment on table public.nrcs_web_outputs is
  'Website publication intent/status for a Story and exact Web Copy version.';
