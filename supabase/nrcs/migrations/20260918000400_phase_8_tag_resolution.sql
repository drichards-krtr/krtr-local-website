begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
alter table public.nrcs_migration_runs add column tag_mappings jsonb not null default '{}';
alter table public.nrcs_migration_runs add column parent_run_id uuid references public.nrcs_migration_runs(id) on delete set null;

create function public.nrcs_migration_tag_snapshot(p_source_slug text,p_tag uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare selected public.nrcs_tags; state jsonb;
begin
  if not public.nrcs_has_role('admin') then raise exception 'Migration admin access required' using errcode='42501'; end if;
  if p_source_slug !~ '^[a-z0-9][a-z0-9-]*$' then raise exception 'Invalid legacy tag slug'; end if;
  select * into selected from public.nrcs_tags where id=p_tag;
  if selected.id is null then raise exception 'Canonical tag no longer exists'; end if;
  if exists(select 1 from public.nrcs_tags where slug=p_source_slug and id<>p_tag)
    or exists(select 1 from public.nrcs_tag_aliases where lower(alias)=lower(p_source_slug) and tag_id<>p_tag) then
    raise exception 'Legacy slug % already belongs to another canonical tag. Select that tag or resolve the conflicting slug/alias in Taxonomy first.',p_source_slug;
  end if;
  state:=public.nrcs_migration_target_state('tags',p_tag);
  return jsonb_build_object('id',selected.id,'name',selected.name,'slug',selected.slug,'target_hash',md5(state::text));
end $$;

-- Keep the already-tested importer for everything except explicit tag reuse.
alter function public.nrcs_migration_apply(uuid,uuid) rename to nrcs_migration_apply_core;
revoke all on function public.nrcs_migration_apply_core(uuid,uuid) from public,anon,authenticated;
create function public.nrcs_migration_apply(p_item uuid,p_token uuid) returns text
language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare item public.nrcs_migration_items; run public.nrcs_migration_runs;
  selected jsonb; snapshot jsonb; previous public.nrcs_migration_identities; result text; entry record;
begin
  select * into item from public.nrcs_migration_items where id=p_item for update;
  select * into run from public.nrcs_migration_runs where id=item.run_id for update;
  if run.id is null or not public.nrcs_has_role('admin') or not public.nrcs_can_access_district(run.district_key)
    or run.phase<>'import' or p_token is null or run.lease_until is null or run.lease_until<now() or run.lease_token is distinct from p_token then
    raise exception 'Active authorized migration lease required' using errcode='42501';
  end if;
  if item.status<>'pending' then return item.status; end if;
  if item.kind='stories' then
    for entry in select key,value from jsonb_each(coalesce(item.normalized->'mapping'->'tags','{}')) loop
      perform 1 from public.nrcs_tags where id=(entry.value->>'id')::uuid for key share;
      snapshot:=public.nrcs_migration_tag_snapshot(entry.key,(entry.value->>'id')::uuid);
      if snapshot<>entry.value or not exists(select 1 from public.nrcs_migration_identities where source_system='cms' and district_key=run.district_key and kind='tags' and source_id=entry.key and target_id=(entry.value->>'id')::uuid) then
        update public.nrcs_migration_items set status='blocked',detail='Mapped canonical tag changed or was not imported; review tag mapping first' where id=p_item; return 'blocked';
      end if;
    end loop;
  end if;
  selected:=item.normalized->'mapping'->'tags'->item.source_id;
  if item.kind<>'tags' or selected is null then return public.nrcs_migration_apply_core(p_item,p_token); end if;
  if jsonb_array_length(item.errors)>0 then update public.nrcs_migration_items set status='blocked',detail='Resolve dry-run exceptions' where id=p_item; return 'blocked'; end if;
  if item.normalized->>'district_key' is distinct from run.district_key then raise exception 'Source district mismatch'; end if;
  -- Lock the chosen canonical object so it cannot change between validation and reuse.
  perform pg_advisory_xact_lock(hashtextextended('legacy-tag-slug:'||item.source_id,0));
  perform 1 from public.nrcs_tags where id=(selected->>'id')::uuid for update;
  snapshot:=public.nrcs_migration_tag_snapshot(item.source_id,(selected->>'id')::uuid);
  if snapshot<>selected then
    update public.nrcs_migration_items set status='conflict',detail='Chosen canonical tag changed; review its mapping again' where id=p_item; return 'conflict';
  end if;
  if snapshot->>'slug'<>item.source_id then
    insert into public.nrcs_tag_aliases(tag_id,alias) values((snapshot->>'id')::uuid,item.source_id) on conflict(tag_id,alias) do nothing;
  end if;
  select * into previous from public.nrcs_migration_identities where source_system='cms' and district_key=run.district_key and kind='tags' and source_id=item.source_id for update;
  result:=case when previous.target_id=(snapshot->>'id')::uuid and previous.source_hash=item.source_hash and previous.mapping=item.normalized->'mapping' then 'unchanged' else 'imported' end;
  insert into public.nrcs_migration_identities(district_key,kind,source_id,target_id,source_hash,target_hash,provenance,mapping)
  values(run.district_key,'tags',item.source_id,(snapshot->>'id')::uuid,item.source_hash,snapshot->>'target_hash',item.raw,item.normalized->'mapping')
  on conflict(source_system,district_key,kind,source_id) do update set target_id=excluded.target_id,source_hash=excluded.source_hash,target_hash=excluded.target_hash,provenance=excluded.provenance,mapping=excluded.mapping,imported_at=now();
  update public.nrcs_migration_items set status=result,detail='Explicitly reused existing canonical tag; its name and slug were preserved' where id=p_item;
  return result;
exception when insufficient_privilege then raise;
when others then
  update public.nrcs_migration_items set status='failed',detail=sqlerrm where id=p_item;
  return 'failed';
end $$;
revoke all on function public.nrcs_migration_tag_snapshot(text,uuid),public.nrcs_migration_apply(uuid,uuid) from public,anon;
grant execute on function public.nrcs_migration_tag_snapshot(text,uuid),public.nrcs_migration_apply(uuid,uuid) to authenticated;
commit;
