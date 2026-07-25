create table if not exists dailys (
  id uuid primary key default gen_random_uuid(),
  district_key text not null default 'dlpc',
  title text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamp null,
  image_url text null,
  cloudinary_public_id text null,
  cloudinary_width int null,
  cloudinary_height int null,
  mux_asset_id text null,
  mux_upload_id text null,
  mux_playback_id text null,
  mux_status text null,
  video_orientation text not null default 'vertical' check (video_orientation in ('vertical','horizontal')),
  slug text null,
  created_by uuid null references profiles(id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create unique index if not exists dailys_district_slug_unique_idx
on dailys (district_key, slug)
where slug is not null;

create index if not exists dailys_district_status_published_idx
on dailys (district_key, status, published_at desc);

drop trigger if exists dailys_set_updated_at on dailys;
create trigger dailys_set_updated_at
before update on dailys
for each row execute procedure set_updated_at();

drop trigger if exists dailys_set_created_by on dailys;
create trigger dailys_set_created_by
before insert on dailys
for each row execute procedure set_created_by();

alter table dailys enable row level security;

drop policy if exists "Dailys public read published" on dailys;
create policy "Dailys public read published"
on dailys for select
using (
  status = 'published'
  and (published_at is null or published_at <= now())
);

drop policy if exists "Dailys admin full" on dailys;
create policy "Dailys admin full"
on dailys for all
using (is_admin())
with check (is_admin());
