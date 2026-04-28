create table if not exists nomination_voting_sessions (
  id uuid primary key default gen_random_uuid(),
  district_key text not null default 'dlpc',
  nomination_id uuid not null references nominations(id) on delete cascade,
  category text not null check (category in ('athletes', 'teachers', 'leaders', 'workforce')),
  slug text not null,
  title text not null,
  open_date date not null,
  close_date date not null,
  status_override text not null default 'auto' check (status_override in ('auto', 'force_open', 'force_closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (close_date >= open_date),
  unique (district_key, slug)
);

create table if not exists nomination_voting_finalists (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references nomination_voting_sessions(id) on delete cascade,
  nomination_submission_id uuid not null references nomination_submissions(id) on delete cascade,
  voting_group text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique (session_id, nomination_submission_id)
);

create table if not exists nomination_votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references nomination_voting_sessions(id) on delete cascade,
  finalist_id uuid not null references nomination_voting_finalists(id) on delete cascade,
  voting_group text not null,
  created_at timestamptz not null default now()
);

create table if not exists nomination_voting_winners (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references nomination_voting_sessions(id) on delete cascade,
  finalist_id uuid not null references nomination_voting_finalists(id) on delete restrict,
  voting_group text not null,
  selected_at timestamptz not null default now(),
  unique (session_id, voting_group)
);

create index if not exists nomination_voting_sessions_district_open_idx
on nomination_voting_sessions (district_key, open_date, close_date);

create unique index if not exists nomination_voting_sessions_force_open_idx
on nomination_voting_sessions (district_key, status_override)
where status_override = 'force_open';

create index if not exists nomination_voting_finalists_session_group_idx
on nomination_voting_finalists (session_id, voting_group);

create index if not exists nomination_votes_session_group_idx
on nomination_votes (session_id, voting_group);

create index if not exists nomination_votes_created_at_idx
on nomination_votes (created_at desc);

create or replace function prevent_nomination_voting_overlap()
returns trigger as $$
begin
  if exists (
    select 1
    from nomination_voting_sessions s
    where s.district_key = new.district_key
      and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(s.open_date, s.close_date, '[]') && daterange(new.open_date, new.close_date, '[]')
  ) then
    raise exception 'Voting date range overlaps an existing voting session.'
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function prevent_nomination_voting_force_open_conflict()
returns trigger as $$
declare
  today_central date := (now() at time zone 'America/Chicago')::date;
begin
  if (
    new.status_override = 'force_open'
    or (new.status_override = 'auto' and new.open_date <= today_central and new.close_date >= today_central)
  ) and exists (
    select 1
    from nomination_voting_sessions s
    where s.district_key = new.district_key
      and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        s.status_override = 'force_open'
        or (s.status_override = 'auto' and s.open_date <= today_central and s.close_date >= today_central)
      )
  ) then
    raise exception 'Another voting session is already open.'
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function enforce_nomination_voting_finalist_limit()
returns trigger as $$
begin
  if (
    select count(*)
    from nomination_voting_finalists f
    where f.session_id = new.session_id
      and f.voting_group = new.voting_group
      and f.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 4 then
    raise exception 'Voting sessions can include no more than four finalists per group.'
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function purge_old_nomination_submissions()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from nomination_submissions
  where submitted_at < now() - interval '365 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists nomination_voting_sessions_set_updated_at on nomination_voting_sessions;
create trigger nomination_voting_sessions_set_updated_at
before update on nomination_voting_sessions
for each row execute procedure set_updated_at();

drop trigger if exists nomination_voting_sessions_prevent_overlap on nomination_voting_sessions;
create trigger nomination_voting_sessions_prevent_overlap
before insert or update on nomination_voting_sessions
for each row execute procedure prevent_nomination_voting_overlap();

drop trigger if exists nomination_voting_sessions_force_open_conflict on nomination_voting_sessions;
create trigger nomination_voting_sessions_force_open_conflict
before insert or update on nomination_voting_sessions
for each row execute procedure prevent_nomination_voting_force_open_conflict();

drop trigger if exists nomination_voting_finalists_limit on nomination_voting_finalists;
create trigger nomination_voting_finalists_limit
before insert or update on nomination_voting_finalists
for each row execute procedure enforce_nomination_voting_finalist_limit();

alter table nomination_voting_sessions enable row level security;
alter table nomination_voting_finalists enable row level security;
alter table nomination_votes enable row level security;
alter table nomination_voting_winners enable row level security;

drop policy if exists "Nomination voting sessions public read" on nomination_voting_sessions;
create policy "Nomination voting sessions public read"
on nomination_voting_sessions for select
using (
  status_override = 'force_open'
  or (
    status_override = 'auto'
    and open_date <= (now() at time zone 'America/Chicago')::date
    and close_date >= (now() at time zone 'America/Chicago')::date
  )
);

drop policy if exists "Nomination voting finalists public read" on nomination_voting_finalists;
create policy "Nomination voting finalists public read"
on nomination_voting_finalists for select
using (
  exists (
    select 1
    from nomination_voting_sessions s
    where s.id = nomination_voting_finalists.session_id
      and (
        s.status_override = 'force_open'
        or (
          s.status_override = 'auto'
          and s.open_date <= (now() at time zone 'America/Chicago')::date
          and s.close_date >= (now() at time zone 'America/Chicago')::date
        )
      )
  )
);

drop policy if exists "Nomination voting sessions admin full" on nomination_voting_sessions;
create policy "Nomination voting sessions admin full"
on nomination_voting_sessions for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Nomination voting finalists admin full" on nomination_voting_finalists;
create policy "Nomination voting finalists admin full"
on nomination_voting_finalists for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Nomination votes admin full" on nomination_votes;
create policy "Nomination votes admin full"
on nomination_votes for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Nomination voting winners admin full" on nomination_voting_winners;
create policy "Nomination voting winners admin full"
on nomination_voting_winners for all
using (public.is_admin())
with check (public.is_admin());
