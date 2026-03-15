alter table logos
add column if not exists is_default boolean not null default false;

create unique index if not exists logos_single_default_idx
on logos (is_default)
where is_default = true;

drop policy if exists "Logos public read active" on logos;
create policy "Logos public read active"
on logos for select
using (
  active = true
  and (
    current_date between start_date and end_date
    or is_default = true
  )
);
