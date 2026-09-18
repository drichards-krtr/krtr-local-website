begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

-- Canonical NRCS taxonomy is not limited to the historical fixed tag array.
alter table public.stories drop constraint if exists stories_tags_allowed;
create table public.story_slug_aliases (
  district_key text not null references public.districts(district_key),
  slug text not null,
  story_id uuid not null references public.stories(id) on delete cascade,
  primary key(district_key,slug)
);
alter table public.story_slug_aliases enable row level security;
create policy story_slug_alias_public_read on public.story_slug_aliases for select using(exists(select 1 from public.stories s where s.id=story_id and s.status='published' and (s.published_at is null or s.published_at<=now() at time zone 'UTC')));
grant select on public.story_slug_aliases to anon,authenticated;
grant all on public.story_slug_aliases to service_role;

create function public.receive_nrcs_web_publication(p_package jsonb,p_hash text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare receipt jsonb; projection public.nrcs_publication_projections;
  article public.stories; slug_owner public.stories; payload jsonb; desired text;
  effective_at timestamptz; actual_state text; target uuid; canonical_tags text[];
begin
  if p_package->>'kind'<>'web' then raise exception 'Web package required'; end if;
  receipt:=public.receive_nrcs_publication(p_package,p_hash);
  select * into projection from public.nrcs_publication_projections where id=(receipt->>'cms_projection_id')::uuid for update;
  if projection.revision<>(p_package->>'revision')::integer then return receipt; end if;
  payload:=projection.package->'payload';
  desired:=payload->>'status';
  if desired not in ('draft','scheduled','published','unpublished') then raise exception 'Invalid publication status'; end if;
  select * into article from public.stories where district_key=projection.district_key and nrcs_output_id=(p_package->>'source_id')::uuid for update;
  if payload->>'cms_article_id' is not null then
    if article.id is not null and article.id<>(payload->>'cms_article_id')::uuid then raise exception 'CMS article identity conflict'; end if;
    select * into article from public.stories where id=(payload->>'cms_article_id')::uuid and district_key=projection.district_key for update;
    if article.id is null then raise exception 'Linked CMS article is missing or belongs to another district'; end if;
  end if;
  select * into slug_owner from public.stories where district_key=projection.district_key and slug=payload->>'slug' for update;
  if article.id is not null and slug_owner.id is not null and article.id<>slug_owner.id then raise exception 'Public slug conflict'; end if;
  if article.id is null then article:=slug_owner; end if;
  if article.nrcs_output_id is not null and article.nrcs_output_id<>(p_package->>'source_id')::uuid then raise exception 'CMS article already belongs to another NRCS output'; end if;
  if article.nrcs_story_id is not null and article.nrcs_story_id<>(payload->>'story_id')::uuid then raise exception 'CMS article already belongs to another NRCS Story'; end if;
  target:=coalesce(article.id,gen_random_uuid());
  if exists(select 1 from public.story_slug_aliases where district_key=projection.district_key and slug=payload->>'slug' and story_id<>target) then raise exception 'Public slug alias conflict'; end if;
  effective_at:=case when desired='scheduled' then (payload->>'scheduled_at')::timestamptz when desired='published' then (payload->>'published_at')::timestamptz else null end;
  if desired in ('scheduled','published') and effective_at is null then raise exception 'Missing publication time'; end if;
  actual_state:=case when desired in ('scheduled','published') then case when effective_at>now() then 'scheduled' else 'published' end else desired end;
  select coalesce(array_agg(t->>'slug'),'{}'::text[]) into canonical_tags from jsonb_array_elements(payload->'tags') t;
  insert into public.stories(id,district_key,title,tease,body_markdown,body_html,status,published_at,slug,image_url,cloudinary_public_id,mux_asset_id,mux_playback_id,mux_status,video_orientation,tags,nrcs_story_id,nrcs_output_id,nrcs_copy_version_id,nrcs_revision,editorial_origin,nrcs_category,nrcs_tags,article_media)
  values(target,projection.district_key,payload->>'title',payload->>'tease','',payload->>'body_html',case when desired in ('published','scheduled') then 'published' when desired='unpublished' then 'archived' else 'draft' end,effective_at at time zone 'UTC',coalesce(payload->>'slug',article.slug,target::text),payload->'hero'->>'url',payload->'hero'->>'public_id',payload->'video'->>'mux_asset_id',payload->'video'->>'playback_id',case when payload->'video'->>'playback_id' is not null then 'ready' else null end,coalesce(payload->'video'->>'orientation','horizontal'),canonical_tags,(payload->>'story_id')::uuid,(p_package->>'source_id')::uuid,(payload->>'copy_version_id')::uuid,projection.revision,'nrcs',payload->'category',payload->'tags',payload->'article_media')
  on conflict(id) do update set title=excluded.title,tease=excluded.tease,body_html=excluded.body_html,status=excluded.status,published_at=excluded.published_at,slug=excluded.slug,image_url=excluded.image_url,cloudinary_public_id=excluded.cloudinary_public_id,mux_asset_id=excluded.mux_asset_id,mux_playback_id=excluded.mux_playback_id,mux_status=excluded.mux_status,video_orientation=excluded.video_orientation,tags=excluded.tags,nrcs_story_id=excluded.nrcs_story_id,nrcs_output_id=excluded.nrcs_output_id,nrcs_copy_version_id=excluded.nrcs_copy_version_id,nrcs_revision=excluded.nrcs_revision,editorial_origin=excluded.editorial_origin,nrcs_category=excluded.nrcs_category,nrcs_tags=excluded.nrcs_tags,article_media=excluded.article_media;
  if article.slug is not null and article.slug is distinct from payload->>'slug' then
    insert into public.story_slug_aliases(district_key,slug,story_id) values(projection.district_key,article.slug,target)
    on conflict(district_key,slug) do update set story_id=excluded.story_id where story_slug_aliases.story_id=excluded.story_id;
    if not found then raise exception 'Historical public slug already belongs to another article'; end if;
  end if;
  return receipt||jsonb_build_object('state',actual_state,'cms_article_id',target,'public_url',case when desired in ('scheduled','published') then '/stories/'||coalesce(payload->>'slug',article.slug,target::text) else null end,'published_at',case when actual_state='published' then effective_at else null end);
end $$;
revoke all on function public.receive_nrcs_web_publication(jsonb,text) from public,anon,authenticated;
grant execute on function public.receive_nrcs_web_publication(jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
