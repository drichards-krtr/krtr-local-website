-- CMS project only. All test writes are rolled back.
begin;
set local role service_role;
do $$
declare district text; package jsonb; first_receipt jsonb; duplicate_receipt jsonb; newer jsonb; old_count bigint; rejected boolean:=false;
begin
  select district_key into district from public.districts where enabled order by district_key limit 1;
  if district is null then raise exception 'An enabled CMS district is required'; end if;
  select count(*) into old_count from public.stories;
  package:=jsonb_build_object('schema_version',1,'request_id',gen_random_uuid(),'source_id',gen_random_uuid(),'district_key',district,'kind','web','revision',1,'payload',jsonb_build_object('title','Rollback-only Phase 7 test','status','published'));
  first_receipt:=public.receive_nrcs_publication(package,repeat('a',64));
  duplicate_receipt:=public.receive_nrcs_publication(package,repeat('a',64));
  if first_receipt<>duplicate_receipt or first_receipt->>'state'<>'received_non_public' or first_receipt->>'public_url' is not null or first_receipt->>'cms_article_id' is not null then raise exception 'Non-public/idempotency receipt failed'; end if;
  if (select count(*) from public.stories)<>old_count then raise exception 'Receiver changed public Stories'; end if;
  begin
    perform public.receive_nrcs_publication(package,repeat('b',64));
  exception when others then
    if sqlerrm not like '%Idempotency key conflict%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Changed request hash was accepted'; end if;
  newer:=package||jsonb_build_object('request_id',gen_random_uuid(),'revision',2);
  perform public.receive_nrcs_publication(newer,repeat('b',64));
  rejected:=false;
  begin
    perform public.receive_nrcs_publication(package||jsonb_build_object('request_id',gen_random_uuid()),repeat('a',64));
  exception when others then
    if sqlerrm not like '%Stale publication revision%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'New stale delivery was accepted'; end if;
  duplicate_receipt:=public.receive_nrcs_publication(package,repeat('a',64));
  if (duplicate_receipt->>'revision')::integer<>1 or (duplicate_receipt->>'current_projection_revision')::integer<>2 then raise exception 'Historical receipt/current revision mismatch'; end if;
  if has_table_privilege('anon','public.nrcs_publication_projections','SELECT') or has_function_privilege('authenticated','public.receive_nrcs_publication(jsonb,text)','EXECUTE') then raise exception 'Private receiver grants failed'; end if;
end $$;
rollback;
