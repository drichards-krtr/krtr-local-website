create table if not exists ad_daily_impressions (
  ad_id uuid not null references ads(id) on delete cascade,
  shown_on date not null,
  show_count int not null default 0 check (show_count >= 0),
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  primary key (ad_id, shown_on)
);

create index if not exists ad_daily_impressions_shown_on_idx
on ad_daily_impressions (shown_on);

drop trigger if exists ad_daily_impressions_set_updated_at on ad_daily_impressions;
create trigger ad_daily_impressions_set_updated_at
before update on ad_daily_impressions
for each row execute procedure set_updated_at();

alter table ad_daily_impressions enable row level security;

drop policy if exists "Ad daily impressions admin full" on ad_daily_impressions;
create policy "Ad daily impressions admin full"
on ad_daily_impressions for all
using (is_admin())
with check (is_admin());

create or replace function increment_ad_daily_impressions(
  p_shown_on date,
  p_ad_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ad_daily_impressions (ad_id, shown_on, show_count)
  select ad_id, p_shown_on, 1
  from unnest(p_ad_ids) as ad_id
  on conflict (ad_id, shown_on)
  do update set
    show_count = ad_daily_impressions.show_count + 1,
    updated_at = now();
end;
$$;

revoke all on function increment_ad_daily_impressions(date, uuid[]) from public;
grant execute on function increment_ad_daily_impressions(date, uuid[]) to service_role;
