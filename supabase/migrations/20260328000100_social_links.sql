create table if not exists public.social_links (
  district_key text primary key check (district_key in ('dlpc', 'vs', 'bc')),
  facebook_url text not null,
  instagram_url text not null,
  youtube_url text not null,
  watch_live_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.social_links (
  district_key,
  facebook_url,
  instagram_url,
  youtube_url,
  watch_live_enabled
)
values
  (
    'dlpc',
    'https://www.facebook.com/KRTRLocal/',
    'https://www.instagram.com/krtr_local/',
    'https://www.youtube.com/@KRTR-Local',
    true
  ),
  (
    'vs',
    'https://www.facebook.com/KRTRLocal/',
    'https://www.instagram.com/krtr_local/',
    'https://www.youtube.com/@KRTR-Local',
    true
  ),
  (
    'bc',
    'https://www.facebook.com/KRTRLocal/',
    'https://www.instagram.com/krtr_local/',
    'https://www.youtube.com/@KRTR-Local',
    true
  )
on conflict (district_key) do nothing;

create or replace function public.set_social_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_links_set_updated_at on public.social_links;

create trigger social_links_set_updated_at
before update on public.social_links
for each row
execute function public.set_social_links_updated_at();
