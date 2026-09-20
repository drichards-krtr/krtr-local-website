begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

create or replace function public.receive_nrcs_daily_publication(p_package jsonb,p_hash text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare receipt jsonb; projection public.nrcs_publication_projections; p jsonb; hero jsonb; video jsonb; zone text; daily_id uuid; desired text; local_date date;
begin
  if p_package->>'kind'<>'daily' then raise exception 'Daily package required'; end if;
  receipt:=public.receive_nrcs_publication(p_package,p_hash);
  select * into projection from public.nrcs_publication_projections where id=(receipt->>'cms_projection_id')::uuid for update;
  if projection.revision<>(p_package->>'revision')::integer then return receipt; end if;
  p:=projection.package->'payload'; hero:=p->'hero'; video:=p->'video'; desired:=p->>'status';
  select timezone into zone from public.districts where district_key=projection.district_key;
  if zone is distinct from p->>'timezone' then raise exception 'District timezone changed; refresh NRCS and resend'; end if;
  local_date:=((p->>'scheduled_at')::timestamptz at time zone zone)::date;
  insert into public.dailys(district_key,title,status,published_at,slug,image_url,cloudinary_public_id,mux_asset_id,mux_playback_id,mux_status,video_orientation,nrcs_source_id,nrcs_revision,nrcs_edition_id,nrcs_publication_date,nrcs_timezone)
  values(projection.district_key,p->>'title',case when desired='archived' then 'archived' when desired='draft' then 'draft' else 'published' end,(p->>'scheduled_at')::timestamptz at time zone 'UTC','nrcs-daily-'||(p_package->>'source_id'),hero->>'url',hero->>'public_id',video->>'mux_asset_id',video->>'playback_id','ready',coalesce(video->>'orientation','horizontal'),(p_package->>'source_id')::uuid,projection.revision,(p->>'edition_id')::uuid,local_date,zone)
  on conflict(nrcs_source_id) do update set title=excluded.title,status=excluded.status,published_at=excluded.published_at,image_url=excluded.image_url,cloudinary_public_id=excluded.cloudinary_public_id,mux_asset_id=excluded.mux_asset_id,mux_playback_id=excluded.mux_playback_id,mux_status=excluded.mux_status,video_orientation=excluded.video_orientation,nrcs_revision=excluded.nrcs_revision,nrcs_edition_id=excluded.nrcs_edition_id,nrcs_publication_date=excluded.nrcs_publication_date,nrcs_timezone=excluded.nrcs_timezone returning id into daily_id;
  return receipt||jsonb_build_object('state','applied','public_url','/');
end $$;
revoke all on function public.receive_nrcs_daily_publication(jsonb,text) from public,anon,authenticated;
grant execute on function public.receive_nrcs_daily_publication(jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
