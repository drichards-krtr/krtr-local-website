create table if not exists stream_schedule (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists stream_schedule_day_start_idx
on stream_schedule (day_of_week, start_time);

alter table stream_config
add column if not exists mode text not null default 'manual'
check (mode in ('manual','auto'));

alter table stream_config
add column if not exists timezone text not null default 'America/Chicago';

alter table stream_schedule enable row level security;

drop policy if exists "Stream schedule admin full" on stream_schedule;
create policy "Stream schedule admin full"
on stream_schedule for all
using (is_admin())
with check (is_admin());
