begin;
alter table public.nrcs_web_outputs add column if not exists tease text;
alter table public.nrcs_web_outputs add column if not exists video_asset_id uuid references public.nrcs_assets(id);
alter table public.nrcs_web_outputs add constraint nrcs_web_output_tease_length check(tease is null or length(tease)<=1000);
create function public.nrcs_validate_web_video() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.video_asset_id is not null and not exists(select 1 from public.nrcs_story_assets l join public.nrcs_assets a on a.id=l.asset_id where l.story_id=new.story_id and a.id=new.video_asset_id and a.asset_type::text='video' and a.mux_status='ready' and a.mux_playback_id is not null) then raise exception 'Select a ready video attached to this Story'; end if;
  return new;
end $$;
create trigger validate_web_video before insert or update on public.nrcs_web_outputs for each row execute function public.nrcs_validate_web_video();
create or replace function public.nrcs_save_web_output(p_output jsonb,p_media uuid[],p_revision integer) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; current_row public.nrcs_web_outputs; hero uuid := nullif(p_output->>'hero_asset_id','')::uuid; media uuid[]:=coalesce(p_media,'{}');
begin
  if not public.nrcs_has_role('contributor') then raise exception 'Forbidden'; end if;
  if p_revision is null or p_revision<0 then raise exception 'Invalid revision'; end if;
  perform pg_advisory_xact_lock(hashtextextended('web-output:'||(p_output->>'story_id'),0));
  select * into current_row from public.nrcs_web_outputs where story_id=(p_output->>'story_id')::uuid for update;
  if current_row.id is not null and current_row.revision<>p_revision or current_row.id is null and p_revision<>0 then raise exception 'Output changed. Reload before saving'; end if;
  if cardinality(media)<>(select count(distinct x) from unnest(media) x) then raise exception 'Duplicate article media'; end if;
  if hero=any(media) then media:=array_prepend(hero,array_remove(media,hero)); end if;
  if current_row.id is not null then delete from public.nrcs_web_output_media where output_id=current_row.id; end if;
  insert into public.nrcs_web_outputs(id,story_id,district_key,copy_version_id,status,slug,hero_asset_id,video_asset_id,tease,seo_title,seo_description,scheduled_at,published_at)
  values(coalesce(current_row.id,gen_random_uuid()),(p_output->>'story_id')::uuid,p_output->>'district_key',nullif(p_output->>'copy_version_id','')::uuid,(p_output->>'status')::public.nrcs_web_output_status,nullif(p_output->>'slug',''),hero,nullif(p_output->>'video_asset_id','')::uuid,nullif(p_output->>'tease',''),nullif(p_output->>'seo_title',''),nullif(p_output->>'seo_description',''),nullif(p_output->>'scheduled_at','')::timestamptz,nullif(p_output->>'published_at','')::timestamptz)
  on conflict(story_id) do update set copy_version_id=excluded.copy_version_id,status=excluded.status,slug=excluded.slug,hero_asset_id=excluded.hero_asset_id,video_asset_id=excluded.video_asset_id,tease=excluded.tease,seo_title=excluded.seo_title,seo_description=excluded.seo_description,scheduled_at=excluded.scheduled_at,published_at=excluded.published_at returning id into result;
  insert into public.nrcs_web_output_media(output_id,asset_id,position) select result,x,ord-1 from unnest(media) with ordinality t(x,ord);
  return result;
end $$;

create table public.nrcs_publication_deliveries (
  request_id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('web','homepage','alert')),
  source_id text not null,
  revision integer not null check(revision>0),
  district_key text not null references public.nrcs_districts(district_key),
  package jsonb not null,
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','sending','received','failed')),
  attempts integer not null default 0,
  lease_until timestamptz, receipt jsonb, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(kind,source_id,revision)
);
create index nrcs_delivery_district_status_idx on public.nrcs_publication_deliveries(district_key,status,updated_at desc);
alter table public.nrcs_publication_deliveries enable row level security;
create policy delivery_editor_read on public.nrcs_publication_deliveries for select using(public.nrcs_has_role('editor') and public.nrcs_can_access_district(district_key));
revoke all on public.nrcs_publication_deliveries from anon,authenticated;
grant select on public.nrcs_publication_deliveries to authenticated;
grant select,insert,update on public.nrcs_publication_deliveries to service_role;
create function public.nrcs_delivery_snapshot_immutable() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.request_id,new.kind,new.source_id,new.revision,new.district_key,new.package,new.content_hash) is distinct from row(old.request_id,old.kind,old.source_id,old.revision,old.district_key,old.package,old.content_hash) then raise exception 'Delivery snapshots are immutable'; end if;
  new.updated_at:=now(); return new;
end $$;
create trigger delivery_snapshot_immutable before update on public.nrcs_publication_deliveries for each row execute function public.nrcs_delivery_snapshot_immutable();
create function public.nrcs_claim_publication_delivery(p_request_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare delivery public.nrcs_publication_deliveries;
begin
  update public.nrcs_publication_deliveries set status='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds',last_error=null where request_id=p_request_id and status<>'received' and (lease_until is null or lease_until<now()) returning * into delivery;
  if delivery.request_id is null then return null; end if;
  return to_jsonb(delivery);
end $$;
revoke all on function public.nrcs_claim_publication_delivery(uuid) from public,anon,authenticated;
grant execute on function public.nrcs_claim_publication_delivery(uuid) to service_role;
commit;
