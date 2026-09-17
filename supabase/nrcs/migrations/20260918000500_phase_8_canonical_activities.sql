begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

alter function public.nrcs_migration_assess(text,uuid,text,jsonb) rename to nrcs_migration_assess_legacy;
revoke all on function public.nrcs_migration_assess_legacy(text,uuid,text,jsonb) from public,anon,authenticated;
create function public.nrcs_migration_assess(p_kind text,p_target uuid,p_baseline text,p_normalized jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if p_kind<>'terms' then return public.nrcs_migration_assess_legacy(p_kind,p_target,p_baseline,p_normalized); end if;
  if not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(p_normalized->>'district_key') then raise exception 'Migration admin access required'; end if;
  if exists(select 1 from public.nrcs_event_classification_terms where id=p_target and (district_key is distinct from p_normalized->>'district_key' or kind::text is distinct from p_normalized->>'kind' or name is distinct from p_normalized->>'name')) then
    return jsonb_build_array('Classification identity/name differs from canonical NRCS; explicit reconciliation required.');
  end if;
  return '[]'::jsonb;
end $$;

alter function public.nrcs_migration_apply(uuid,uuid) rename to nrcs_migration_apply_tag_core;
revoke all on function public.nrcs_migration_apply_tag_core(uuid,uuid) from public,anon,authenticated;
create function public.nrcs_migration_apply(p_item uuid,p_token uuid) returns text
language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare item public.nrcs_migration_items; run public.nrcs_migration_runs;
  previous public.nrcs_migration_identities; canonical public.nrcs_event_classification_terms;
  n jsonb; target uuid; state jsonb; result text;
begin
  select * into item from public.nrcs_migration_items where id=p_item for update;
  select * into run from public.nrcs_migration_runs where id=item.run_id for update;
  if run.id is null or not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(run.district_key)
    or run.phase<>'import' or p_token is null or run.lease_until is null or run.lease_until<now() or run.lease_token is distinct from p_token then
    raise exception 'Active authorized migration lease required' using errcode='42501';
  end if;
  if item.kind<>'terms' then return public.nrcs_migration_apply_tag_core(p_item,p_token); end if;
  if item.status<>'pending' then return item.status; end if;
  if jsonb_array_length(item.errors)>0 then update public.nrcs_migration_items set status='blocked',detail='Resolve exceptions and run a fresh dry run' where id=p_item; return 'blocked'; end if;
  n:=item.normalized;
  if n->>'district_key' is distinct from run.district_key then raise exception 'Source district mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('legacy-classification:'||run.district_key||':'||(n->>'kind')||':'||(n->>'name'),0));
  select * into previous from public.nrcs_migration_identities where source_system='cms' and district_key=run.district_key and kind='terms' and source_id=item.source_id for update;
  if previous.target_id is not null then
    select * into canonical from public.nrcs_event_classification_terms where id=previous.target_id for update;
    if canonical.id is null or canonical.district_key is distinct from run.district_key or canonical.kind::text is distinct from n->>'kind' or canonical.name is distinct from n->>'name' then
      update public.nrcs_migration_items set status='conflict',detail='Canonical classification identity/name changed; explicit reconciliation required' where id=p_item; return 'conflict';
    end if;
  else
    select * into canonical from public.nrcs_event_classification_terms where district_key=run.district_key and kind::text=n->>'kind' and name=n->>'name' for update;
  end if;
  if canonical.id is null then
    target:=(n->>'target_id')::uuid;
    insert into public.nrcs_event_classification_terms(id,district_key,kind,name,enabled)
    values(target,run.district_key,(n->>'kind')::public.nrcs_event_classification_kind,n->>'name',(n->>'enabled')::boolean);
  else
    target:=canonical.id;
    -- Existing NRCS configuration always wins, including changes since Dry Run.
  end if;
  state:=public.nrcs_migration_target_state('terms',target);
  result:=case when previous.target_id=target and previous.source_hash=item.source_hash and previous.mapping=coalesce(n->'mapping','{}') then 'unchanged' else 'imported' end;
  insert into public.nrcs_migration_identities(district_key,kind,source_id,target_id,source_hash,target_hash,provenance,mapping)
  values(run.district_key,'terms',item.source_id,target,item.source_hash,md5(state::text),item.raw,coalesce(n->'mapping','{}'))
  on conflict(source_system,district_key,kind,source_id) do update set target_id=excluded.target_id,source_hash=excluded.source_hash,target_hash=excluded.target_hash,provenance=excluded.provenance,mapping=excluded.mapping,imported_at=now();
  update public.nrcs_migration_items set status=result,detail='Classification linked; canonical NRCS enabled/disabled setting preserved' where id=p_item;
  return result;
exception when insufficient_privilege then raise;
when others then update public.nrcs_migration_items set status='failed',detail=sqlerrm where id=p_item; return 'failed';
end $$;
revoke all on function public.nrcs_migration_assess(text,uuid,text,jsonb),public.nrcs_migration_apply(uuid,uuid) from public,anon;
grant execute on function public.nrcs_migration_assess(text,uuid,text,jsonb),public.nrcs_migration_apply(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
