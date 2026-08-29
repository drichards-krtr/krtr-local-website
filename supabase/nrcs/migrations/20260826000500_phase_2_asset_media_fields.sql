alter table public.nrcs_assets
add column if not exists district_key text null references public.nrcs_districts(district_key) on update cascade,
add column if not exists category_id uuid null references public.nrcs_categories(id) on delete set null,
add column if not exists mux_upload_id text null,
add column if not exists mux_status text null,
add column if not exists thumbnail_url text null;

create table if not exists public.nrcs_asset_tags (
  asset_id uuid not null references public.nrcs_assets(id) on delete cascade,
  tag_id uuid not null references public.nrcs_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (asset_id, tag_id)
);

create index if not exists nrcs_assets_district_type_created_idx
on public.nrcs_assets (district_key, asset_type, created_at desc);

create index if not exists nrcs_assets_category_idx
on public.nrcs_assets (category_id);

create index if not exists nrcs_assets_mux_upload_idx
on public.nrcs_assets (mux_upload_id);

create index if not exists nrcs_asset_tags_tag_idx
on public.nrcs_asset_tags (tag_id);

alter table public.nrcs_asset_tags enable row level security;

drop policy if exists "NRCS assets staff read" on public.nrcs_assets;
create policy "NRCS assets staff read"
on public.nrcs_assets for select
using (
  public.nrcs_has_role('editor')
  or created_by = auth.uid()
  or asset_type in ('image', 'graphic')
);

drop policy if exists "NRCS assets contributor insert" on public.nrcs_assets;
create policy "NRCS assets contributor insert"
on public.nrcs_assets for insert
with check (
  public.nrcs_has_role('contributor')
  and created_by = auth.uid()
  and (district_key is null or public.nrcs_can_access_district(district_key))
);

drop policy if exists "NRCS assets owner editor update" on public.nrcs_assets;
create policy "NRCS assets owner editor update"
on public.nrcs_assets for update
using (
  public.nrcs_has_role('editor')
  or created_by = auth.uid()
)
with check (
  (public.nrcs_has_role('editor') or created_by = auth.uid())
  and (district_key is null or public.nrcs_can_access_district(district_key))
);

drop policy if exists "NRCS asset tags read" on public.nrcs_asset_tags;
create policy "NRCS asset tags read"
on public.nrcs_asset_tags for select
using (
  exists (
    select 1
    from public.nrcs_assets a
    where a.id = asset_id
      and (
        public.nrcs_has_role('editor')
        or a.created_by = auth.uid()
        or a.asset_type in ('image', 'graphic')
      )
  )
);

drop policy if exists "NRCS asset tags write" on public.nrcs_asset_tags;
create policy "NRCS asset tags write"
on public.nrcs_asset_tags for all
using (
  exists (
    select 1
    from public.nrcs_assets a
    where a.id = asset_id
      and (public.nrcs_has_role('editor') or a.created_by = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.nrcs_assets a
    where a.id = asset_id
      and (public.nrcs_has_role('editor') or a.created_by = auth.uid())
  )
);

comment on table public.nrcs_asset_tags is
  'Canonical NRCS tag assignments for reusable media assets.';
