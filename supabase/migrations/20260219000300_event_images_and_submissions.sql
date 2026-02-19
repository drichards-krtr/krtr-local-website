create table if not exists event_submitters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  created_at timestamp default now()
);

alter table events
add column if not exists image_url text null;

alter table events
add column if not exists submitter_id uuid null references event_submitters(id) on delete set null;

create index if not exists events_submitter_id_idx on events (submitter_id);

alter table event_submitters enable row level security;

drop policy if exists "Event submitters admin full" on event_submitters;
create policy "Event submitters admin full"
on event_submitters for all
using (is_admin())
with check (is_admin());
