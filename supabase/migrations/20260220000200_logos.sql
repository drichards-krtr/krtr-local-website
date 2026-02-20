create table if not exists logos (
  id uuid primary key default gen_random_uuid(),
  description text null,
  image_url text not null,
  active boolean not null default true,
  start_date date not null,
  end_date date not null,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  check (end_date >= start_date)
);

drop trigger if exists logos_set_updated_at on logos;
create trigger logos_set_updated_at
before update on logos
for each row execute procedure set_updated_at();

alter table logos enable row level security;

drop policy if exists "Logos public read active" on logos;
create policy "Logos public read active"
on logos for select
using (
  active = true
  and current_date between start_date and end_date
);

drop policy if exists "Logos admin full" on logos;
create policy "Logos admin full"
on logos for all
using (is_admin())
with check (is_admin());
