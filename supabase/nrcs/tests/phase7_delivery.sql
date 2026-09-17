-- NRCS project only. All test writes are rolled back.
begin;
set local role service_role;
do $$
declare district text; request uuid:=gen_random_uuid(); first_claim jsonb; duplicate_claim jsonb; rejected boolean:=false;
begin
  select district_key into district from public.nrcs_districts order by district_key limit 1;
  if district is null then raise exception 'An NRCS district is required'; end if;
  insert into public.nrcs_publication_deliveries(request_id,kind,source_id,revision,district_key,package,content_hash) values(request,'web',gen_random_uuid()::text,1,district,'{}',repeat('a',64));
  first_claim:=public.nrcs_claim_publication_delivery(request);
  duplicate_claim:=public.nrcs_claim_publication_delivery(request);
  if first_claim is null or (first_claim->>'attempts')::integer<>1 or duplicate_claim is not null then raise exception 'Delivery lease failed'; end if;
  begin
    update public.nrcs_publication_deliveries set package='{"changed":true}' where request_id=request;
  exception when others then
    if sqlerrm not like '%snapshots are immutable%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Snapshot modification accepted'; end if;
  update public.nrcs_publication_deliveries set status='received',lease_until=null where request_id=request;
  if public.nrcs_claim_publication_delivery(request) is not null then raise exception 'Received delivery could be reclaimed'; end if;
  if has_table_privilege('anon','public.nrcs_publication_deliveries','SELECT') or has_table_privilege('authenticated','public.nrcs_publication_deliveries','INSERT') or has_function_privilege('authenticated','public.nrcs_claim_publication_delivery(uuid)','EXECUTE') then raise exception 'Delivery grants failed'; end if;
end $$;
rollback;
