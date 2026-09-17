-- Optional: run in NRCS SQL Editor AFTER Phase 6. Fixtures are always rolled back.
begin;
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','f6000000-0000-0000-0000-000000000001','authenticated','authenticated','phase6-editor@example.invalid',now(),now(),now()),
('00000000-0000-0000-0000-000000000000','f6000000-0000-0000-0000-000000000002','authenticated','authenticated','phase6-contributor@example.invalid',now(),now(),now());
insert into public.nrcs_staff_profiles(id,email,role,active) values
('f6000000-0000-0000-0000-000000000001','phase6-editor@example.invalid','editor',true),
('f6000000-0000-0000-0000-000000000002','phase6-contributor@example.invalid','contributor',true);
insert into public.nrcs_districts(district_key,subdomain,display_name,enabled) values('phase6_test','phase6-test.example.invalid','Phase 6 test',true);
insert into public.nrcs_staff_districts(staff_id,district_key) values
('f6000000-0000-0000-0000-000000000001','phase6_test'),('f6000000-0000-0000-0000-000000000002','phase6_test');
insert into public.nrcs_stories(id,district_key,title,created_by) values
('f6100000-0000-0000-0000-000000000001','phase6_test','Own','f6000000-0000-0000-0000-000000000002'),
('f6100000-0000-0000-0000-000000000002','phase6_test','Other','f6000000-0000-0000-0000-000000000001');
insert into public.nrcs_copy_streams(id,story_id,stream_type) values
('f6200000-0000-0000-0000-000000000001','f6100000-0000-0000-0000-000000000001','web'),
('f6200000-0000-0000-0000-000000000002','f6100000-0000-0000-0000-000000000001','social');
insert into public.nrcs_copy_versions(id,stream_id,version_number,body_html) values
('f6300000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001',1,'<p>Web</p>'),
('f6300000-0000-0000-0000-000000000002','f6200000-0000-0000-0000-000000000002',1,'<p>Social</p>');
insert into public.nrcs_assets(id,asset_type,title,cloudinary_url,created_by) values
('f6400000-0000-0000-0000-000000000001','graphic','Hero','https://example.invalid/hero.png','f6000000-0000-0000-0000-000000000002'),
('f6400000-0000-0000-0000-000000000002','graphic','Other image','https://example.invalid/other.png','f6000000-0000-0000-0000-000000000002');
insert into public.nrcs_story_assets(story_id,asset_id) values
('f6100000-0000-0000-0000-000000000001','f6400000-0000-0000-0000-000000000001'),
('f6100000-0000-0000-0000-000000000001','f6400000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare payload jsonb := '{"story_id":"f6100000-0000-0000-0000-000000000001","district_key":"phase6_test","copy_version_id":"f6300000-0000-0000-000000000001","status":"draft","slug":"phase6-test","hero_asset_id":"f6400000-0000-0000-0000-000000000001"}'; result uuid; denied boolean;
begin
  result:=public.nrcs_save_web_output(payload,array['f6400000-0000-0000-0000-000000000002','f6400000-0000-0000-0000-000000000001']::uuid[],0);
  if not exists(select 1 from public.nrcs_web_output_media where output_id=result and position=0 and asset_id='f6400000-0000-0000-0000-000000000001') then raise exception 'Hero was not ordered first'; end if;
  denied:=false;
  begin perform public.nrcs_save_web_output(payload,'{}',0);
  exception when raise_exception then if sqlerrm not like 'Output changed%' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Stale output overwrote current state'; end if;
  denied:=false;
  begin perform public.nrcs_save_web_output(payload||'{"copy_version_id":"f6300000-0000-0000-0000-000000000002"}','{}',1);
  exception when raise_exception then if sqlerrm not like 'Select an exact%' then raise; end if; denied:=true; end;
  if not denied or (select count(*) from public.nrcs_web_output_media where output_id=result)<>2 then raise exception 'Failed output save did not roll back media'; end if;
  denied:=false;
  begin perform public.nrcs_save_web_output(payload||'{"status":"published","published_at":"2026-09-17T17:00:00Z"}','{}',1);
  exception when raise_exception or insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Contributor published'; end if;
  denied:=false;
  begin insert into public.nrcs_homepage_lineups(district_key) values('phase6_test');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Contributor managed homepage'; end if;
  insert into public.nrcs_social_outputs(story_id,district_key,destination,copy_version_id) values('f6100000-0000-0000-0000-000000000001','phase6_test','Facebook','f6300000-0000-0000-0000-000000000002');
  result:=public.nrcs_attach_output_image('{"title":"Library image","cloudinary_public_id":"phase6-test/image","cloudinary_url":"https://res.cloudinary.com/phase6-test/image/upload/image.png"}','phase6_test','f6100000-0000-0000-0000-000000000001');
  if result<>public.nrcs_attach_output_image('{"title":"Library image","cloudinary_public_id":"phase6-test/image","cloudinary_url":"https://res.cloudinary.com/phase6-test/image/upload/image.png"}','phase6_test','f6100000-0000-0000-0000-000000000001') then raise exception 'Shared image registration duplicated the asset'; end if;
end $$;

select set_config('request.jwt.claim.sub','f6000000-0000-0000-0000-000000000001',true);
do $$
declare result uuid; denied boolean;
begin
  result:=public.nrcs_save_web_output('{"story_id":"f6100000-0000-0000-0000-000000000001","district_key":"phase6_test","copy_version_id":"f6300000-0000-0000-0000-000000000001","status":"published","slug":"phase6-test","published_at":"2026-09-17T17:00:00Z"}','{}',1);
  insert into public.nrcs_homepage_lineups(district_key,hero_output_id,top_output_ids) values('phase6_test',result,array[result]);
  insert into public.nrcs_priority_alerts(district_key,headline,active,start_at,end_at) values('phase6_test','First',true,'2026-09-17T17:00:00Z','2026-09-17T18:00:00Z');
  denied:=false;
  begin insert into public.nrcs_priority_alerts(district_key,headline,active,start_at,end_at) values('phase6_test','Overlap',true,'2026-09-17T17:30:00Z','2026-09-17T18:30:00Z');
  exception when raise_exception then if sqlerrm not like 'Another enabled alert%' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Overlapping alerts enabled'; end if;
  insert into public.nrcs_priority_alerts(district_key,headline,active,start_at,end_at) values('phase6_test','Adjacent',true,'2026-09-17T18:00:00Z','2026-09-17T19:00:00Z');
  if (select hero_output_id from public.nrcs_homepage_lineups where district_key='phase6_test')<>result then raise exception 'Alert overwrote Hero'; end if;
  update public.nrcs_stories set lifecycle_state='ready' where id='f6100000-0000-0000-0000-000000000001';
  update public.nrcs_social_outputs set status='published',published_at=now() where story_id='f6100000-0000-0000-0000-000000000001';
  if (select lifecycle_state from public.nrcs_stories where id='f6100000-0000-0000-0000-000000000001')<>'active' then raise exception 'Manual social publication did not activate Ready Story'; end if;
end $$;
reset role;
rollback;
