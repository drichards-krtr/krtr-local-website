create table if not exists site_pages (
  slug text primary key check (slug in ('about', 'termsprivacy', 'advertise')),
  title text not null,
  body_markdown text not null default '',
  updated_at timestamp default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists site_pages_set_updated_at on site_pages;
create trigger site_pages_set_updated_at
before update on site_pages
for each row execute procedure set_updated_at();

insert into site_pages (slug, title, body_markdown)
values
  ('about', 'About Us', 'Add your About Us content in CMS Settings.'),
  ('termsprivacy', 'Terms of Use', 'Add your Terms and Privacy content in CMS Settings.'),
  ('advertise', 'Advertise with KRTR Local', 'Add your advertising information in CMS Settings.')
on conflict (slug) do nothing;

alter table site_pages enable row level security;

drop policy if exists "Site pages public read" on site_pages;
create policy "Site pages public read"
on site_pages for select
using (true);

drop policy if exists "Site pages admin full" on site_pages;
create policy "Site pages admin full"
on site_pages for all
using (is_admin())
with check (is_admin());
