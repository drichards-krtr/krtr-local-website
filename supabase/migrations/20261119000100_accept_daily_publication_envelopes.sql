-- Daily packages use the shared publication receiver before the Daily-specific
-- projection handler runs. Keep the existing envelope safeguards while allowing
-- the Daily publication kind already supported by the downstream handler.
create or replace function public.receive_nrcs_publication(p_package jsonb, p_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  projection public.nrcs_publication_projections;
  prior public.nrcs_publication_receipts;
  result jsonb;
  requested_revision integer := (p_package->>'revision')::integer;
  target text := p_package->>'kind';
  source text := p_package->>'source_id';
  district text := p_package->>'district_key';
begin
  if p_package->>'schema_version' <> '1'
     or target not in ('web', 'homepage', 'alert', 'daily')
     or requested_revision < 1
     or p_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Invalid publication envelope';
  end if;

  if not exists (
    select 1
    from public.districts d
    where d.district_key = district
      and d.enabled
  ) then
    raise exception 'District is unknown or disabled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nrcs-request:' || (p_package->>'request_id'), 0));
  select *
  into prior
  from public.nrcs_publication_receipts
  where request_id = (p_package->>'request_id')::uuid;

  if prior.request_id is not null then
    if prior.content_hash <> p_hash
       or prior.receipt->>'kind' <> target
       or prior.receipt->>'source_id' <> source
       or prior.receipt->>'district_key' <> district
       or (prior.receipt->>'revision')::integer <> requested_revision
    then
      raise exception 'Idempotency key conflict';
    end if;

    select *
    into projection
    from public.nrcs_publication_projections
    where id = prior.projection_id;

    return prior.receipt || jsonb_build_object('current_projection_revision', projection.revision);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nrcs-projection:' || target || ':' || source, 0));
  select *
  into projection
  from public.nrcs_publication_projections
  where kind = target
    and source_id = source
  for update;

  if projection.id is not null then
    if projection.district_key <> district then
      raise exception 'Projection district cannot change';
    end if;
    if projection.revision > requested_revision then
      raise exception 'Stale publication revision';
    end if;
    if projection.revision = requested_revision and projection.content_hash <> p_hash then
      raise exception 'Revision content conflict. Save a new NRCS revision';
    end if;
  end if;

  insert into public.nrcs_publication_projections(
    kind,
    source_id,
    district_key,
    revision,
    package,
    content_hash
  )
  values(target, source, district, requested_revision, p_package, p_hash)
  on conflict(kind, source_id) do update
  set revision = excluded.revision,
      package = excluded.package,
      content_hash = excluded.content_hash,
      received_at = now()
  returning * into projection;

  result := jsonb_build_object(
    'schema_version', 1,
    'request_id', p_package->>'request_id',
    'kind', target,
    'source_id', source,
    'district_key', district,
    'revision', requested_revision,
    'content_hash', p_hash,
    'state', 'received_non_public',
    'cms_projection_id', projection.id,
    'cms_article_id', null,
    'public_url', null,
    'published_at', null,
    'received_at', projection.received_at,
    'current_projection_revision', projection.revision
  );

  insert into public.nrcs_publication_receipts(request_id, projection_id, content_hash, receipt)
  values((p_package->>'request_id')::uuid, projection.id, p_hash, result);

  return result;
end;
$$;

revoke all on function public.receive_nrcs_publication(jsonb, text) from public, anon, authenticated;
grant execute on function public.receive_nrcs_publication(jsonb, text) to service_role;
