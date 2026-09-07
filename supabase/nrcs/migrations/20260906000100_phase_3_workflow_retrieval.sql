do $$
begin
  if not exists (select 1 from pg_type where typname = 'nrcs_follow_up_status') then
    create type nrcs_follow_up_status as enum ('open', 'in_progress', 'completed', 'canceled');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_story_wake_status') then
    create type nrcs_story_wake_status as enum ('active', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_intake_type') then
    create type nrcs_intake_type as enum ('story_tip', 'calendar_submission');
  end if;

  if not exists (select 1 from pg_type where typname = 'nrcs_intake_status') then
    create type nrcs_intake_status as enum ('new', 'in_review', 'converted', 'dismissed');
  end if;
end $$;

create table if not exists public.nrcs_follow_ups (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  title text not null,
  description text null,
  due_at timestamptz not null,
  status nrcs_follow_up_status not null default 'open',
  context_type text null,
  context_id uuid null,
  context_label text null,
  origin_copy_version_id uuid null references public.nrcs_copy_versions(id) on delete set null,
  created_by uuid not null references public.nrcs_staff_profiles(id) on delete restrict,
  completed_at timestamptz null,
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_follow_ups_title_present check (length(trim(title)) > 0),
  constraint nrcs_follow_ups_context_type_known check (
    context_type is null or context_type in (
      'story',
      'copy_stream',
      'copy_version',
      'event',
      'source',
      'asset',
      'story_tip',
      'calendar_submission'
    )
  )
);

create table if not exists public.nrcs_follow_up_activity_logs (
  id uuid primary key default gen_random_uuid(),
  follow_up_id uuid not null references public.nrcs_follow_ups(id) on delete cascade,
  activity_type text not null default 'note',
  note text not null,
  happened_at timestamptz not null default now(),
  backdated boolean not null default false,
  created_by uuid not null references public.nrcs_staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint nrcs_follow_up_activity_note_present check (length(trim(note)) > 0),
  constraint nrcs_follow_up_activity_type_known check (
    activity_type in ('created', 'note', 'rescheduled', 'completed', 'canceled', 'reopened')
  )
);

create table if not exists public.nrcs_story_wakes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.nrcs_stories(id) on delete cascade,
  wake_at timestamptz not null,
  reason text null,
  status nrcs_story_wake_status not null default 'active',
  created_by uuid not null references public.nrcs_staff_profiles(id) on delete restrict,
  closed_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nrcs_story_wakes_one_active_story_idx
on public.nrcs_story_wakes (story_id)
where status = 'active';

create table if not exists public.nrcs_story_wake_history (
  id uuid primary key default gen_random_uuid(),
  wake_id uuid not null references public.nrcs_story_wakes(id) on delete cascade,
  action text not null,
  note text null,
  prior_wake_at timestamptz null,
  new_wake_at timestamptz null,
  created_by uuid not null references public.nrcs_staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint nrcs_story_wake_history_action_known check (
    action in ('created', 'snoozed', 'closed', 'activated')
  )
);

create table if not exists public.nrcs_recent_items (
  user_id uuid not null references public.nrcs_staff_profiles(id) on delete cascade,
  object_type text not null,
  object_id uuid not null,
  district_key text null references public.nrcs_districts(district_key) on update cascade,
  title text not null,
  href text not null,
  viewed_at timestamptz not null default now(),
  primary key (user_id, object_type, object_id),
  constraint nrcs_recent_items_object_type_known check (
    object_type in ('story', 'event', 'source', 'asset', 'follow_up', 'story_tip', 'calendar_submission')
  )
);

create table if not exists public.nrcs_intake_items (
  id uuid primary key default gen_random_uuid(),
  intake_type nrcs_intake_type not null,
  district_key text not null references public.nrcs_districts(district_key) on update cascade,
  status nrcs_intake_status not null default 'new',
  title text not null,
  summary text null,
  body text null,
  submitter_name text null,
  submitter_email text null,
  submitter_phone text null,
  payload jsonb not null default '{}'::jsonb,
  source_system text not null default 'cms_public',
  external_source_id text null,
  reviewed_by uuid null references public.nrcs_staff_profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nrcs_intake_items_title_present check (length(trim(title)) > 0)
);

create unique index if not exists nrcs_intake_items_external_source_idx
on public.nrcs_intake_items (source_system, external_source_id);

create index if not exists nrcs_follow_ups_dashboard_idx
on public.nrcs_follow_ups (district_key, status, due_at);

create index if not exists nrcs_follow_ups_context_idx
on public.nrcs_follow_ups (context_type, context_id);

create index if not exists nrcs_follow_up_activity_logs_follow_up_idx
on public.nrcs_follow_up_activity_logs (follow_up_id, happened_at desc);

create index if not exists nrcs_story_wakes_story_status_idx
on public.nrcs_story_wakes (story_id, status, wake_at);

create index if not exists nrcs_recent_items_user_viewed_idx
on public.nrcs_recent_items (user_id, viewed_at desc);

create index if not exists nrcs_intake_items_dashboard_idx
on public.nrcs_intake_items (district_key, status, created_at desc);

drop trigger if exists nrcs_follow_ups_set_updated_at on public.nrcs_follow_ups;
create trigger nrcs_follow_ups_set_updated_at
before update on public.nrcs_follow_ups
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_story_wakes_set_updated_at on public.nrcs_story_wakes;
create trigger nrcs_story_wakes_set_updated_at
before update on public.nrcs_story_wakes
for each row execute procedure public.nrcs_set_updated_at();

drop trigger if exists nrcs_intake_items_set_updated_at on public.nrcs_intake_items;
create trigger nrcs_intake_items_set_updated_at
before update on public.nrcs_intake_items
for each row execute procedure public.nrcs_set_updated_at();

alter table public.nrcs_follow_ups enable row level security;
alter table public.nrcs_follow_up_activity_logs enable row level security;
alter table public.nrcs_story_wakes enable row level security;
alter table public.nrcs_story_wake_history enable row level security;
alter table public.nrcs_recent_items enable row level security;
alter table public.nrcs_intake_items enable row level security;

create or replace function public.nrcs_can_read_context(requested_context_type text, requested_context_id uuid, requested_district_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when requested_context_type is null or requested_context_id is null then
        public.nrcs_can_access_district(requested_district_key)
      when requested_context_type = 'story' then
        public.nrcs_can_read_story(requested_context_id)
      when requested_context_type = 'event' then
        exists (
          select 1
          from public.nrcs_events e
          where e.id = requested_context_id
            and public.nrcs_can_access_district(e.district_key)
            and (
              public.nrcs_has_role('editor')
              or e.created_by = auth.uid()
              or e.status = 'published'
            )
        )
      else
        public.nrcs_can_access_district(requested_district_key)
    end;
$$;

create or replace function public.nrcs_can_write_context(requested_context_type text, requested_context_id uuid, requested_district_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when requested_context_type is null or requested_context_id is null then
        public.nrcs_can_access_district(requested_district_key)
      when requested_context_type = 'story' then
        public.nrcs_can_write_story(requested_context_id)
      when requested_context_type = 'event' then
        exists (
          select 1
          from public.nrcs_events e
          where e.id = requested_context_id
            and public.nrcs_can_access_district(e.district_key)
            and (public.nrcs_has_role('editor') or e.created_by = auth.uid())
        )
      else
        public.nrcs_can_access_district(requested_district_key)
    end;
$$;

drop policy if exists "NRCS follow ups read" on public.nrcs_follow_ups;
create policy "NRCS follow ups read"
on public.nrcs_follow_ups for select
using (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
    or public.nrcs_can_read_context(context_type, context_id, district_key)
  )
);

drop policy if exists "NRCS follow ups insert" on public.nrcs_follow_ups;
create policy "NRCS follow ups insert"
on public.nrcs_follow_ups for insert
with check (
  public.nrcs_has_role('contributor')
  and created_by = auth.uid()
  and public.nrcs_can_access_district(district_key)
  and public.nrcs_can_read_context(context_type, context_id, district_key)
);

drop policy if exists "NRCS follow ups update" on public.nrcs_follow_ups;
create policy "NRCS follow ups update"
on public.nrcs_follow_ups for update
using (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
    or public.nrcs_can_write_context(context_type, context_id, district_key)
  )
)
with check (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
    or public.nrcs_can_write_context(context_type, context_id, district_key)
  )
);

drop policy if exists "NRCS follow up logs read" on public.nrcs_follow_up_activity_logs;
create policy "NRCS follow up logs read"
on public.nrcs_follow_up_activity_logs for select
using (
  exists (
    select 1 from public.nrcs_follow_ups f
    where f.id = follow_up_id
      and public.nrcs_can_access_district(f.district_key)
      and (
        public.nrcs_has_role('editor')
        or f.created_by = auth.uid()
        or public.nrcs_can_read_context(f.context_type, f.context_id, f.district_key)
      )
  )
);

drop policy if exists "NRCS follow up logs insert" on public.nrcs_follow_up_activity_logs;
create policy "NRCS follow up logs insert"
on public.nrcs_follow_up_activity_logs for insert
with check (
  created_by = auth.uid()
  and public.nrcs_has_role('contributor')
  and (
    backdated = false
    or public.nrcs_has_role('editor')
  )
  and exists (
    select 1 from public.nrcs_follow_ups f
    where f.id = follow_up_id
      and public.nrcs_can_access_district(f.district_key)
  )
);

drop policy if exists "NRCS story wakes read" on public.nrcs_story_wakes;
create policy "NRCS story wakes read"
on public.nrcs_story_wakes for select
using (public.nrcs_can_read_story(story_id));

drop policy if exists "NRCS story wakes write" on public.nrcs_story_wakes;
create policy "NRCS story wakes write"
on public.nrcs_story_wakes for all
using (public.nrcs_can_write_story(story_id))
with check (public.nrcs_can_write_story(story_id));

drop policy if exists "NRCS story wake history read" on public.nrcs_story_wake_history;
create policy "NRCS story wake history read"
on public.nrcs_story_wake_history for select
using (
  exists (
    select 1 from public.nrcs_story_wakes w
    where w.id = wake_id and public.nrcs_can_read_story(w.story_id)
  )
);

drop policy if exists "NRCS story wake history insert" on public.nrcs_story_wake_history;
create policy "NRCS story wake history insert"
on public.nrcs_story_wake_history for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.nrcs_story_wakes w
    where w.id = wake_id and public.nrcs_can_write_story(w.story_id)
  )
);

drop policy if exists "NRCS recent items own read" on public.nrcs_recent_items;
create policy "NRCS recent items own read"
on public.nrcs_recent_items for select
using (user_id = auth.uid());

drop policy if exists "NRCS recent items own write" on public.nrcs_recent_items;
create policy "NRCS recent items own write"
on public.nrcs_recent_items for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "NRCS intake editor read" on public.nrcs_intake_items;
create policy "NRCS intake editor read"
on public.nrcs_intake_items for select
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS intake editor update" on public.nrcs_intake_items;
create policy "NRCS intake editor update"
on public.nrcs_intake_items for update
using (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS intake service insert" on public.nrcs_intake_items;
create policy "NRCS intake service insert"
on public.nrcs_intake_items for insert
with check (false);

comment on table public.nrcs_follow_ups is
'Phase 3 actionable newsroom follow-ups with optional contextual linkage.';

comment on table public.nrcs_story_wakes is
'Phase 3 story wake reminders. Wakes do not change story lifecycle state.';

comment on table public.nrcs_intake_items is
'Phase 3 NRCS intake queue for public Story Tip and Community Calendar submissions.';
