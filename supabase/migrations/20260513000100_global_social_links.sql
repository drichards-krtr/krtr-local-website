alter table public.social_links
drop constraint if exists social_links_district_key_check;

alter table public.social_links
add constraint social_links_district_key_check
check (district_key in ('global', 'dlpc', 'vs', 'bc'));

insert into public.social_links (
  district_key,
  facebook_url,
  instagram_url,
  youtube_url,
  watch_live_enabled
)
select
  'global',
  facebook_url,
  instagram_url,
  youtube_url,
  watch_live_enabled
from public.social_links
where district_key = 'dlpc'
on conflict (district_key) do nothing;
