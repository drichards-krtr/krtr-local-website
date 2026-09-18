begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

-- Inspect applied presentation, never replay publication instructions during a status check.
create function public.nrcs_web_publication_status(p_request_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare delivery public.nrcs_publication_receipts; projection public.nrcs_publication_projections;
  article public.stories; result jsonb; current_public boolean:=false; actual_state text;
begin
  select * into delivery from public.nrcs_publication_receipts where request_id=p_request_id;
  if delivery.request_id is null then raise exception 'CMS receipt not found'; end if;
  select * into projection from public.nrcs_publication_projections where id=delivery.projection_id;
  if projection.kind<>'web' then raise exception 'Web status required'; end if;
  result:=delivery.receipt||jsonb_build_object('current_projection_revision',projection.revision);
  select * into article from public.stories where district_key=projection.district_key
    and nrcs_output_id=projection.source_id::uuid;
  current_public:=coalesce(projection.revision=(delivery.receipt->>'revision')::integer
    and projection.content_hash=delivery.content_hash and article.nrcs_revision=projection.revision
    and article.editorial_origin='nrcs'
    and article.nrcs_story_id=(projection.package->'payload'->>'story_id')::uuid
    and article.nrcs_copy_version_id is not distinct from (projection.package->'payload'->>'copy_version_id')::uuid,false);
  if current_public then
    actual_state:=case when article.status='published' then
      case when article.published_at>now() at time zone 'UTC' then 'scheduled' else 'published' end
      when article.status='draft' then 'draft' else 'unpublished' end;
    result:=result||jsonb_build_object('state',actual_state,'cms_article_id',article.id,
      'public_url',case when actual_state in ('scheduled','published') then '/stories/'||article.slug else null end,
      'published_at',case when actual_state='published' then article.published_at at time zone 'UTC' else null end);
  end if;
  return jsonb_build_object('receipt',result,'current',current_public,'checked_at',statement_timestamp());
end $$;
revoke all on function public.nrcs_web_publication_status(uuid) from public,anon,authenticated;
grant execute on function public.nrcs_web_publication_status(uuid) to service_role;
notify pgrst,'reload schema';
commit;
