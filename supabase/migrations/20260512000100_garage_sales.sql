create table if not exists garage_sale_sessions (
  id uuid primary key default gen_random_uuid(),
  district_key text not null default 'dlpc',
  slug text not null,
  name text not null,
  open_date date not null,
  close_date date not null,
  page_copy text not null default '',
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (district_key, slug)
);

create table if not exists garage_sale_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references garage_sale_sessions(id) on delete cascade,
  district_key text not null default 'dlpc',
  address text not null,
  date_times text not null,
  items text not null,
  image_url text null,
  submitter_name text not null,
  submitter_phone text not null,
  submitter_email text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists garage_sale_sessions_district_window_idx
on garage_sale_sessions (district_key, status, open_date, close_date);

create index if not exists garage_sale_submissions_session_status_idx
on garage_sale_submissions (session_id, status, created_at);

create index if not exists garage_sale_submissions_district_status_idx
on garage_sale_submissions (district_key, status, created_at);

drop trigger if exists garage_sale_sessions_set_updated_at on garage_sale_sessions;
create trigger garage_sale_sessions_set_updated_at
before update on garage_sale_sessions
for each row execute procedure set_updated_at();

drop trigger if exists garage_sale_submissions_set_updated_at on garage_sale_submissions;
create trigger garage_sale_submissions_set_updated_at
before update on garage_sale_submissions
for each row execute procedure set_updated_at();

alter table garage_sale_sessions enable row level security;
alter table garage_sale_submissions enable row level security;

drop policy if exists "Garage sale sessions public read active" on garage_sale_sessions;
create policy "Garage sale sessions public read active"
on garage_sale_sessions for select
using (
  status = 'active'
  and current_date between open_date and close_date
);

drop policy if exists "Garage sale submissions public read published" on garage_sale_submissions;
create policy "Garage sale submissions public read published"
on garage_sale_submissions for select
using (status = 'published');

drop policy if exists "Garage sale sessions admin full" on garage_sale_sessions;
create policy "Garage sale sessions admin full"
on garage_sale_sessions for all
using (is_admin())
with check (is_admin());

drop policy if exists "Garage sale submissions admin full" on garage_sale_submissions;
create policy "Garage sale submissions admin full"
on garage_sale_submissions for all
using (is_admin())
with check (is_admin());
