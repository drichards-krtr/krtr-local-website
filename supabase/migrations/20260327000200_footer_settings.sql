create table if not exists public.footer_settings (
  district_key text primary key check (district_key in ('dlpc', 'vs', 'bc')),
  legal_name text not null,
  address_line text not null,
  phone text not null,
  updated_at timestamptz not null default now()
);

insert into public.footer_settings (district_key, legal_name, address_line, phone)
values
  ('dlpc', 'KRTR Local, LLC', '502 Main Street, La Porte City, IA 50651', '319-486-1525'),
  ('vs', 'KRTR Local, LLC', '502 Main Street, La Porte City, IA 50651', '319-486-1525'),
  ('bc', 'KRTR Local, LLC', '502 Main Street, La Porte City, IA 50651', '319-486-1525')
on conflict (district_key) do nothing;

create or replace function public.set_footer_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists footer_settings_set_updated_at on public.footer_settings;

create trigger footer_settings_set_updated_at
before update on public.footer_settings
for each row
execute function public.set_footer_settings_updated_at();
