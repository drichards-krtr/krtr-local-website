create table if not exists story_submitters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  submitted_story_id uuid null references stories(id) on delete set null,
  created_at timestamp default now()
);

alter table stories
add column if not exists submitter_id uuid null references story_submitters(id) on delete set null;

create index if not exists stories_submitter_id_idx on stories (submitter_id);
create index if not exists story_submitters_submitted_story_id_idx on story_submitters (submitted_story_id);

alter table story_submitters enable row level security;

drop policy if exists "Story submitters admin full" on story_submitters;
create policy "Story submitters admin full"
on story_submitters for all
using (is_admin())
with check (is_admin());
