create table if not exists nominations (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('athletes', 'teachers', 'leaders', 'workforce')),
  open_date date not null,
  close_date date not null,
  status_override text not null default 'auto' check (status_override in ('auto', 'force_open', 'force_closed')),
  created_at timestamp default now(),
  updated_at timestamp default now(),
  check (close_date >= open_date)
);

create table if not exists nomination_copy (
  category text primary key check (category in ('athletes', 'teachers', 'leaders', 'workforce')),
  title text not null,
  body_markdown text not null default '',
  submit_button_text text not null default 'Submit Nomination',
  success_message text not null default 'Thank You For Nominating',
  updated_at timestamp default now()
);

create table if not exists nomination_submissions (
  id uuid primary key default gen_random_uuid(),
  nomination_id uuid null references nominations(id) on delete set null,
  category text not null check (category in ('athletes', 'teachers', 'leaders', 'workforce')),
  submitter_name text not null,
  submitter_email text not null,
  submitter_phone text not null,
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nominations_open_close_idx
on nominations (open_date, close_date);

create unique index if not exists nominations_one_force_open_idx
on nominations (status_override)
where status_override = 'force_open';

create index if not exists nomination_submissions_submitted_at_idx
on nomination_submissions (submitted_at desc);

create index if not exists nomination_submissions_category_idx
on nomination_submissions (category);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function prevent_nomination_overlap()
returns trigger as $$
begin
  if exists (
    select 1
    from nominations n
    where n.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(n.open_date, n.close_date, '[]') && daterange(new.open_date, new.close_date, '[]')
  ) then
    raise exception 'Nomination date range overlaps an existing nomination.'
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function lock_nomination_category()
returns trigger as $$
begin
  if old.category <> new.category then
    raise exception 'Nomination category is locked after creation.'
      using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function purge_old_nomination_submissions()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from nomination_submissions
  where submitted_at < now() - interval '90 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$ language sql stable security definer set search_path = public;

drop trigger if exists nominations_set_updated_at on nominations;
create trigger nominations_set_updated_at
before update on nominations
for each row execute procedure set_updated_at();

drop trigger if exists nomination_copy_set_updated_at on nomination_copy;
create trigger nomination_copy_set_updated_at
before update on nomination_copy
for each row execute procedure set_updated_at();

drop trigger if exists nomination_submissions_set_updated_at on nomination_submissions;
create trigger nomination_submissions_set_updated_at
before update on nomination_submissions
for each row execute procedure set_updated_at();

drop trigger if exists nominations_prevent_overlap on nominations;
create trigger nominations_prevent_overlap
before insert or update on nominations
for each row execute procedure prevent_nomination_overlap();

drop trigger if exists nominations_lock_category on nominations;
create trigger nominations_lock_category
before update on nominations
for each row execute procedure lock_nomination_category();

insert into nomination_copy (category, title, body_markdown, submit_button_text, success_message)
values
  (
    'athletes',
    'Athletes of the Month Nominations',
    'Nominate an athlete who is making a positive impact.',
    'Submit Athlete Nomination',
    'Thank You For Nominating'
  ),
  (
    'teachers',
    'Teachers of the Month Nominations',
    'Nominate a teacher who deserves recognition.',
    'Submit Teacher Nomination',
    'Thank You For Nominating'
  ),
  (
    'leaders',
    'Local Leader of the Month Nominations',
    'Nominate a local leader making a difference in the community.',
    'Submit Leader Nomination',
    'Thank You For Nominating'
  ),
  (
    'workforce',
    'Workforce Star of the Month Nominations',
    'Nominate a workforce star who stands out.',
    'Submit Workforce Nomination',
    'Thank You For Nominating'
  )
on conflict (category) do nothing;

alter table nominations enable row level security;
alter table nomination_copy enable row level security;
alter table nomination_submissions enable row level security;

drop policy if exists "Nominations public read" on nominations;
create policy "Nominations public read"
on nominations for select
using (true);

drop policy if exists "Nomination copy public read" on nomination_copy;
create policy "Nomination copy public read"
on nomination_copy for select
using (true);

drop policy if exists "Nominations admin full" on nominations;
create policy "Nominations admin full"
on nominations for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Nomination copy admin full" on nomination_copy;
create policy "Nomination copy admin full"
on nomination_copy for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Nomination submissions admin full" on nomination_submissions;
create policy "Nomination submissions admin full"
on nomination_submissions for all
using (public.is_admin())
with check (public.is_admin());
