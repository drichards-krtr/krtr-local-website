-- Optional Phase 5 permission/atomicity checks. Run in NRCS SQL Editor after migrations.
-- All fixtures and changes are rolled back. Any failure aborts the transaction.
begin;
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','f5000000-0000-0000-0000-000000000001','authenticated','authenticated','phase5-editor@example.invalid',now(),now(),now()),
('00000000-0000-0000-0000-000000000000','f5000000-0000-0000-0000-000000000002','authenticated','authenticated','phase5-contributor@example.invalid',now(),now(),now()),
('00000000-0000-0000-0000-000000000000','f5000000-0000-0000-0000-000000000003','authenticated','authenticated','phase5-other@example.invalid',now(),now(),now());
insert into public.nrcs_staff_profiles(id,email,role,active) values
('f5000000-0000-0000-0000-000000000001','phase5-editor@example.invalid','editor',true),
('f5000000-0000-0000-0000-000000000002','phase5-contributor@example.invalid','contributor',true),
('f5000000-0000-0000-0000-000000000003','phase5-other@example.invalid','contributor',true);
insert into public.nrcs_districts(district_key,subdomain,display_name,enabled) values ('phase5_test','phase5-test.example.invalid','Phase 5 test',true);
insert into public.nrcs_staff_districts(staff_id,district_key) select id,'phase5_test' from public.nrcs_staff_profiles where id in (
'f5000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002','f5000000-0000-0000-0000-000000000003');
insert into public.nrcs_stories(id,district_key,title,lifecycle_state,created_by) values
('f5100000-0000-0000-0000-000000000001','phase5_test','Own','idea','f5000000-0000-0000-0000-000000000002'),
('f5100000-0000-0000-0000-000000000002','phase5_test','Other active','active','f5000000-0000-0000-0000-000000000003');
insert into public.nrcs_programs(id,district_key,name) values ('f5200000-0000-0000-0000-000000000001','phase5_test','Test');
insert into public.nrcs_editions(id,program_id,district_key,title,air_at) values
('f5300000-0000-0000-0000-000000000001','f5200000-0000-0000-0000-000000000001','phase5_test','A',now()),
('f5300000-0000-0000-0000-000000000002','f5200000-0000-0000-0000-000000000001','phase5_test','B',now());
insert into public.nrcs_rundown_items(id,edition_id,item_type,title) values
('f5400000-0000-0000-0000-000000000001','f5300000-0000-0000-0000-000000000002','segment','Weather');

set local role authenticated;
select set_config('request.jwt.claim.sub','f5000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare payload jsonb := '{"id":"f5500000-0000-0000-0000-000000000001","district_key":"phase5_test","title":"Graphic","cloudinary_public_id":"phase5-test","cloudinary_url":"https://example.invalid/graphic.png"}'; denied boolean;
begin
  perform public.nrcs_register_generated_graphic(payload,'f5100000-0000-0000-0000-000000000001');
  perform public.nrcs_register_generated_graphic(payload,'f5100000-0000-0000-0000-000000000001');
  if (select count(*) from public.nrcs_story_assets where asset_id='f5500000-0000-0000-0000-000000000001')<>1 then raise exception 'Duplicate retry attachment'; end if;
  if (select district_key from public.nrcs_assets where id='f5500000-0000-0000-0000-000000000001') is not null then raise exception 'Shared graphic was forced into district ownership'; end if;
  denied := false;
  begin
    perform public.nrcs_register_generated_graphic(payload,'f5100000-0000-0000-0000-000000000002');
  exception when raise_exception then
    if sqlerrm <> 'Story is not editable' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'Contributor attached to another Story'; end if;
  if exists(select 1 from public.nrcs_edition_assets) then raise exception 'Contributor sees Edition assets'; end if;
  denied := false;
  begin
    insert into public.nrcs_school_identities(name,mascot,display_name,logo_url) values ('Test','Test','Test','https://example.invalid/test.png');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Contributor can manage schools'; end if;
  denied := false;
  begin
    perform public.nrcs_register_generated_graphic(payload || '{"id":"f5500000-0000-0000-0000-000000000002"}',null,'f5300000-0000-0000-0000-000000000001');
  exception when raise_exception then
    if sqlerrm <> 'Edition is not editable' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'Contributor can save Edition assets'; end if;
end $$;

select set_config('request.jwt.claim.sub','f5000000-0000-0000-0000-000000000001',true);
do $$
declare payload jsonb := '{"id":"f5500000-0000-0000-0000-000000000003","district_key":"phase5_test","title":"Editor graphic","cloudinary_public_id":"phase5-editor","cloudinary_url":"https://example.invalid/graphic.png"}'; denied boolean;
begin
  perform public.nrcs_register_generated_graphic(payload,null,'f5300000-0000-0000-0000-000000000002','f5400000-0000-0000-0000-000000000001');
  if not exists(select 1 from public.nrcs_edition_assets where asset_id='f5500000-0000-0000-0000-000000000003') then raise exception 'Editor save failed'; end if;
  denied := false;
  begin
    insert into public.nrcs_edition_assets(edition_id,asset_id,rundown_item_id) values ('f5300000-0000-0000-0000-000000000001','f5500000-0000-0000-0000-000000000003','f5400000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cross-Edition item attachment permitted'; end if;
  begin
    perform public.nrcs_register_generated_graphic(payload || '{"id":"f5500000-0000-0000-0000-000000000004"}',null,null,null,array['f5600000-0000-0000-0000-000000000001'::uuid]);
    raise exception 'Invalid tag was accepted';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  if exists(select 1 from public.nrcs_assets where id='f5500000-0000-0000-0000-000000000004') then raise exception 'Failed save left a partial asset'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
do $$ begin
  if exists(select 1 from public.nrcs_school_identities) then raise exception 'Anonymous school read'; end if;
  if exists(select 1 from public.nrcs_assets) then raise exception 'Anonymous asset read'; end if;
  if exists(select 1 from public.nrcs_edition_assets) then raise exception 'Anonymous Edition asset read'; end if;
end $$;
reset role;
select 'PASS: Phase 5 permissions, duplicate retry, and atomic save checks' as result;
rollback;
