begin;
-- Bound database waits without changing global or application timeout settings.
set local lock_timeout = '5s';
set local statement_timeout = '45s';
-- Dormant presentation fields; nothing populates public Stories in Phase 7.
-- Preserve the failing operation in the error returned by the SQL Editor.
do $phase7_migration$
declare migration_step text;
begin
  migration_step := '1. alter table public.stories add column if not exists nrcs_story_id uuid;';
  execute $phase7_sql$
alter table public.stories add column if not exists nrcs_story_id uuid;
$phase7_sql$;

  migration_step := '2. alter table public.stories add column if not exists nrcs_output_id uuid;';
  execute $phase7_sql$
alter table public.stories add column if not exists nrcs_output_id uuid;
$phase7_sql$;

  migration_step := '3. alter table public.stories add column if not exists nrcs_copy_version_id uuid;';
  execute $phase7_sql$
alter table public.stories add column if not exists nrcs_copy_version_id uuid;
$phase7_sql$;

  migration_step := '4. alter table public.stories add column if not exists editorial_origin text not null default ''cms'' check(editorial_origin in (''cms'',''nrcs''));';
  execute $phase7_sql$
alter table public.stories add column if not exists editorial_origin text not null default 'cms' check(editorial_origin in ('cms','nrcs'));
$phase7_sql$;

  migration_step := '5. alter table public.stories add column if not exists nrcs_revision integer check(nrcs_revision is null or nrcs_revision>0);';
  execute $phase7_sql$
alter table public.stories add column if not exists nrcs_revision integer check(nrcs_revision is null or nrcs_revision>0);
$phase7_sql$;

  migration_step := '6. alter table public.stories add column if not exists body_html text;';
  execute $phase7_sql$
alter table public.stories add column if not exists body_html text;
$phase7_sql$;

  migration_step := '7. alter table public.stories add column if not exists nrcs_category jsonb;';
  execute $phase7_sql$
alter table public.stories add column if not exists nrcs_category jsonb;
$phase7_sql$;

  migration_step := '8. alter table public.stories add column if not exists nrcs_tags jsonb not null default ''[]'';';
  execute $phase7_sql$
alter table public.stories add column if not exists nrcs_tags jsonb not null default '[]';
$phase7_sql$;

  migration_step := '9. alter table public.stories add column if not exists article_media jsonb not null default ''[]'';';
  execute $phase7_sql$
alter table public.stories add column if not exists article_media jsonb not null default '[]';
$phase7_sql$;

  migration_step := '10. create unique index if not exists stories_nrcs_output_unique on public.stories(nrcs_output_id) where nrcs_output_id is not null;';
  execute $phase7_sql$
create unique index if not exists stories_nrcs_output_unique on public.stories(nrcs_output_id) where nrcs_output_id is not null;
$phase7_sql$;

  migration_step := '11. create table public.nrcs_publication_projections (';
  execute $phase7_sql$
create table public.nrcs_publication_projections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('web','homepage','alert')),
  source_id text not null,
  district_key text not null references public.districts(district_key),
  revision integer not null check(revision>0),
  package jsonb not null,
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now(),
  unique(kind,source_id)
);
$phase7_sql$;

  migration_step := '12. create table public.nrcs_publication_receipts (';
  execute $phase7_sql$
create table public.nrcs_publication_receipts (
  request_id uuid primary key,
  projection_id uuid not null references public.nrcs_publication_projections(id),
  content_hash text not null,
  receipt jsonb not null,
  received_at timestamptz not null default now()
);
$phase7_sql$;

  migration_step := '13. create index nrcs_projection_district_received_idx on public.nrcs_publication_projections(district_key,received_at desc);';
  execute $phase7_sql$
create index nrcs_projection_district_received_idx on public.nrcs_publication_projections(district_key,received_at desc);
$phase7_sql$;

  migration_step := '14. alter table public.nrcs_publication_projections enable row level security;';
  execute $phase7_sql$
alter table public.nrcs_publication_projections enable row level security;
$phase7_sql$;

  migration_step := '15. alter table public.nrcs_publication_receipts enable row level security;';
  execute $phase7_sql$
alter table public.nrcs_publication_receipts enable row level security;
$phase7_sql$;

  migration_step := '16. create policy nrcs_projection_admin_read on public.nrcs_publication_projections for select using(public.is_admin());';
  execute $phase7_sql$
create policy nrcs_projection_admin_read on public.nrcs_publication_projections for select using(public.is_admin());
$phase7_sql$;

  migration_step := '17. create policy nrcs_receipt_admin_read on public.nrcs_publication_receipts for select using(public.is_admin());';
  execute $phase7_sql$
create policy nrcs_receipt_admin_read on public.nrcs_publication_receipts for select using(public.is_admin());
$phase7_sql$;

  migration_step := '18. revoke all on public.nrcs_publication_projections,public.nrcs_publication_receipts from anon,authenticated;';
  execute $phase7_sql$
revoke all on public.nrcs_publication_projections,public.nrcs_publication_receipts from anon,authenticated;
$phase7_sql$;

  migration_step := '19. grant select on public.nrcs_publication_projections,public.nrcs_publication_receipts to authenticated;';
  execute $phase7_sql$
grant select on public.nrcs_publication_projections,public.nrcs_publication_receipts to authenticated;
$phase7_sql$;

  migration_step := '20. grant select,insert,update on public.nrcs_publication_projections,public.nrcs_publication_receipts to service_role;';
  execute $phase7_sql$
grant select,insert,update on public.nrcs_publication_projections,public.nrcs_publication_receipts to service_role;
$phase7_sql$;

  migration_step := '21. create function public.receive_nrcs_publication(p_package jsonb,p_hash text) returns jsonb language plpgsql security invoker set search_path=public as $$';
  execute $phase7_sql$
create function public.receive_nrcs_publication(p_package jsonb,p_hash text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare projection public.nrcs_publication_projections; prior public.nrcs_publication_receipts; result jsonb; requested_revision integer:=(p_package->>'revision')::integer; target text:=p_package->>'kind'; source text:=p_package->>'source_id'; district text:=p_package->>'district_key';
begin
  if p_package->>'schema_version'<>'1' or target not in ('web','homepage','alert') or requested_revision<1 or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid publication envelope'; end if;
  if not exists(select 1 from public.districts d where d.district_key=district and d.enabled) then raise exception 'District is unknown or disabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nrcs-request:'||(p_package->>'request_id'),0));
  select * into prior from public.nrcs_publication_receipts where request_id=(p_package->>'request_id')::uuid;
  if prior.request_id is not null then
    if prior.content_hash<>p_hash or prior.receipt->>'kind'<>target or prior.receipt->>'source_id'<>source or prior.receipt->>'district_key'<>district or (prior.receipt->>'revision')::integer<>requested_revision then raise exception 'Idempotency key conflict'; end if;
    select * into projection from public.nrcs_publication_projections where id=prior.projection_id;
    return prior.receipt||jsonb_build_object('current_projection_revision',projection.revision);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nrcs-projection:'||target||':'||source,0));
  select * into projection from public.nrcs_publication_projections where kind=target and source_id=source for update;
  if projection.id is not null then
    if projection.district_key<>district then raise exception 'Projection district cannot change'; end if;
    if projection.revision>requested_revision then raise exception 'Stale publication revision'; end if;
    if projection.revision=requested_revision and projection.content_hash<>p_hash then raise exception 'Revision content conflict. Save a new NRCS revision'; end if;
  end if;
  insert into public.nrcs_publication_projections(kind,source_id,district_key,revision,package,content_hash) values(target,source,district,requested_revision,p_package,p_hash)
  on conflict(kind,source_id) do update set revision=excluded.revision,package=excluded.package,content_hash=excluded.content_hash,received_at=now() returning * into projection;
  result:=jsonb_build_object('schema_version',1,'request_id',p_package->>'request_id','kind',target,'source_id',source,'district_key',district,'revision',requested_revision,'content_hash',p_hash,'state','received_non_public','cms_projection_id',projection.id,'cms_article_id',null,'public_url',null,'published_at',null,'received_at',projection.received_at,'current_projection_revision',projection.revision);
  insert into public.nrcs_publication_receipts(request_id,projection_id,content_hash,receipt) values((p_package->>'request_id')::uuid,projection.id,p_hash,result);
  return result;
end $$;
$phase7_sql$;

  migration_step := '22. revoke all on function public.receive_nrcs_publication(jsonb,text) from public,anon,authenticated;';
  execute $phase7_sql$
revoke all on function public.receive_nrcs_publication(jsonb,text) from public,anon,authenticated;
$phase7_sql$;

  migration_step := '23. grant execute on function public.receive_nrcs_publication(jsonb,text) to service_role;';
  execute $phase7_sql$
grant execute on function public.receive_nrcs_publication(jsonb,text) to service_role;

-- Preserve the already-live Event workflow, but make its related writes atomic.
$phase7_sql$;

  migration_step := '24. create function public.receive_nrcs_event(p_event jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$';
  execute $phase7_sql$
create function public.receive_nrcs_event(p_event jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved public.events; term uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nrcs-event:'||(p_event->>'id'),0));
  insert into public.events(nrcs_source_id,district_key,title,description,body_html,location_name,address,city,state,zip,location,start_at,end_at,image_url,status,is_school_sports)
  values((p_event->>'id')::uuid,p_event->>'district_key',p_event->>'title',p_event->>'description',p_event->>'body_html',p_event->>'location_name',p_event->>'address',p_event->>'city',p_event->>'state',p_event->>'zip',p_event->>'location',(p_event->>'start_at')::timestamp,nullif(p_event->>'end_at','')::timestamp,p_event->>'image_url',p_event->>'status',coalesce(p_event->'classification'->>'kind'='sport',false))
  on conflict(nrcs_source_id) do update set district_key=excluded.district_key,title=excluded.title,description=excluded.description,body_html=excluded.body_html,location_name=excluded.location_name,address=excluded.address,city=excluded.city,state=excluded.state,zip=excluded.zip,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,image_url=excluded.image_url,status=excluded.status,is_school_sports=excluded.is_school_sports returning * into saved;
  delete from public.event_classification_assignments where event_id=saved.id;
  if p_event->'classification' is not null and p_event->'classification'<>'null'::jsonb then
    insert into public.event_classification_terms(district_key,kind,name,enabled) values(saved.district_key,(p_event->'classification'->>'kind')::public.event_classification_kind,p_event->'classification'->>'name',(p_event->'classification'->>'enabled')::boolean)
    on conflict(district_key,kind,name) do update set enabled=excluded.enabled returning id into term;
    insert into public.event_classification_assignments(event_id,term_id) values(saved.id,term);
  end if;
  return jsonb_build_object('id',saved.id,'nrcs_source_id',saved.nrcs_source_id,'district_key',saved.district_key,'status',saved.status);
end $$;
$phase7_sql$;

  migration_step := '25. revoke all on function public.receive_nrcs_event(jsonb) from public,anon,authenticated;';
  execute $phase7_sql$
revoke all on function public.receive_nrcs_event(jsonb) from public,anon,authenticated;
$phase7_sql$;

  migration_step := '26. grant execute on function public.receive_nrcs_event(jsonb) to service_role;';
  execute $phase7_sql$
grant execute on function public.receive_nrcs_event(jsonb) to service_role;
$phase7_sql$;
exception when others then
  raise exception 'Phase 7 CMS migration failed at %: %', migration_step, SQLERRM
    using errcode = SQLSTATE;
end $phase7_migration$;
commit;
