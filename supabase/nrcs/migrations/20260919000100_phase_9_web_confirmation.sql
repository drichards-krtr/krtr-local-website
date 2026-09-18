begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
alter table public.nrcs_publication_deliveries add column confirmation jsonb;

create function public.nrcs_confirm_web_lifecycle() returns trigger
language plpgsql security invoker set search_path=public as $$
declare receipt jsonb; output public.nrcs_web_outputs;
begin
  if new.kind<>'web' or new.status<>'received' then return new; end if;
  receipt:=case when new.confirmation is not null then
    case when (new.confirmation->>'current')::boolean then new.confirmation->'receipt' else null end
    else new.receipt end;
  if receipt->>'state' is distinct from 'published' then return new; end if;
  if receipt->>'request_id' is distinct from new.request_id::text
    or receipt->>'source_id' is distinct from new.source_id
    or receipt->>'district_key' is distinct from new.district_key
    or receipt->>'content_hash' is distinct from new.content_hash
    or (receipt->>'revision')::integer is distinct from new.revision
    or (receipt->>'current_projection_revision')::integer is distinct from new.revision
    or nullif(receipt->>'cms_article_id','') is null
    or nullif(receipt->>'published_at','') is null then raise exception 'Invalid publication confirmation'; end if;
  select * into output from public.nrcs_web_outputs where id=new.source_id::uuid for update;
  if output.id is null or output.district_key<>new.district_key or output.revision<>new.revision
    or output.story_id is distinct from (new.package->'payload'->>'story_id')::uuid
    or output.copy_version_id is distinct from (new.package->'payload'->>'copy_version_id')::uuid then return new; end if;
  -- Confirmation is operational metadata: do not mutate output instructions or increment their revision.
  update public.nrcs_stories set lifecycle_state='active'
    where id=output.story_id and district_key=output.district_key and lifecycle_state='ready';
  return new;
end $$;
create trigger confirm_web_lifecycle after update of receipt,confirmation,status
on public.nrcs_publication_deliveries for each row execute function public.nrcs_confirm_web_lifecycle();

create function public.nrcs_record_publication_status(p_request_id uuid,p_confirmation jsonb) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if jsonb_typeof(p_confirmation->'current') is distinct from 'boolean'
    or nullif(p_confirmation->>'checked_at','') is null then raise exception 'Invalid status confirmation'; end if;
  update public.nrcs_publication_deliveries set confirmation=p_confirmation
    where request_id=p_request_id and kind='web' and status='received'
    and (confirmation is null or (confirmation->>'checked_at')::timestamptz<(p_confirmation->>'checked_at')::timestamptz);
end $$;
revoke all on function public.nrcs_record_publication_status(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nrcs_record_publication_status(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
