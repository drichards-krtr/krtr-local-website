-- Phase 1 NRCS permission harness.
-- Run against a disposable NRCS Supabase database after applying migrations.
-- Expected matrix: admin can manage staff, editor/contributor can read only self,
-- inactive and anonymous users cannot read staff rows.

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@example.com', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'editor@example.com', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'contributor-a@example.com', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'contributor-b@example.com', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'inactive@example.com', now(), now(), now())
on conflict (id) do nothing;

insert into public.nrcs_staff_profiles (id, email, role, active)
values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', 'admin', true),
  ('00000000-0000-0000-0000-000000000002', 'editor@example.com', 'editor', true),
  ('00000000-0000-0000-0000-000000000003', 'contributor-a@example.com', 'contributor', true),
  ('00000000-0000-0000-0000-000000000004', 'contributor-b@example.com', 'contributor', true),
  ('00000000-0000-0000-0000-000000000005', 'inactive@example.com', 'editor', false)
on conflict (id) do update set role = excluded.role, active = excluded.active;

insert into public.nrcs_districts (district_key, subdomain, display_name, enabled)
values ('dlpc', 'dlpc.krtrlocal.tv', 'Dysart-La Porte City', true)
on conflict (district_key) do update set enabled = true;

insert into public.nrcs_staff_districts (staff_id, district_key)
values
  ('00000000-0000-0000-0000-000000000001', 'dlpc'),
  ('00000000-0000-0000-0000-000000000002', 'dlpc'),
  ('00000000-0000-0000-0000-000000000003', 'dlpc'),
  ('00000000-0000-0000-0000-000000000004', 'dlpc')
on conflict do nothing;

insert into public.nrcs_stories (
  id,
  district_key,
  title,
  lifecycle_state,
  created_by,
  updated_by
)
values
  ('10000000-0000-0000-0000-000000000001', 'dlpc', 'Contributor A Draft', 'idea', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000002', 'dlpc', 'Contributor B Draft', 'idea', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000003', 'dlpc', 'Contributor B Active', 'active', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004')
on conflict (id) do update set
  lifecycle_state = excluded.lifecycle_state,
  created_by = excluded.created_by,
  updated_by = excluded.updated_by;

insert into public.nrcs_events (
  id,
  district_key,
  title,
  location_name,
  address,
  city,
  state,
  zip,
  start_at,
  status,
  created_by
)
values
  ('20000000-0000-0000-0000-000000000001', 'dlpc', 'Contributor A Draft Event', 'Venue', '1 Main St', 'Dysart', 'IA', '52224', now(), 'draft', '00000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002', 'dlpc', 'Contributor B Draft Event', 'Venue', '1 Main St', 'Dysart', 'IA', '52224', now(), 'draft', '00000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000003', 'dlpc', 'Contributor B Published Event', 'Venue', '1 Main St', 'Dysart', 'IA', '52224', now(), 'published', '00000000-0000-0000-0000-000000000004')
on conflict (id) do update set
  status = excluded.status,
  created_by = excluded.created_by;

create temp table nrcs_permission_results (
  actor text not null,
  check_name text not null,
  expected int not null,
  actual int not null
) on commit drop;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into nrcs_permission_results
select 'admin', 'staff_rows_visible', 5, count(*)::int from public.nrcs_staff_profiles;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
insert into nrcs_permission_results
select 'editor', 'own_staff_row_visible', 1, count(*)::int from public.nrcs_staff_profiles;
insert into nrcs_permission_results
select 'editor', 'all_district_stories_visible', 3, count(*)::int from public.nrcs_stories;
insert into nrcs_permission_results
select 'editor', 'all_district_events_visible', 3, count(*)::int from public.nrcs_events;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
insert into nrcs_permission_results
select 'contributor_a', 'own_staff_row_visible', 1, count(*)::int from public.nrcs_staff_profiles;
insert into nrcs_permission_results
select 'contributor_a', 'own_story_and_other_active_visible', 2, count(*)::int from public.nrcs_stories;
insert into nrcs_permission_results
select 'contributor_a', 'other_draft_story_hidden', 0, count(*)::int
from public.nrcs_stories
where id = '10000000-0000-0000-0000-000000000002';
insert into nrcs_permission_results
select 'contributor_a', 'own_event_and_other_published_visible', 2, count(*)::int from public.nrcs_events;
insert into nrcs_permission_results
select 'contributor_a', 'other_draft_event_hidden', 0, count(*)::int
from public.nrcs_events
where id = '20000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
insert into nrcs_permission_results
select 'inactive', 'no_staff_rows_visible', 0, count(*)::int from public.nrcs_staff_profiles;
insert into nrcs_permission_results
select 'inactive', 'no_stories_visible', 0, count(*)::int from public.nrcs_stories;
insert into nrcs_permission_results
select 'inactive', 'no_events_visible', 0, count(*)::int from public.nrcs_events;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
insert into nrcs_permission_results
select 'anonymous', 'no_staff_rows_visible', 0, count(*)::int from public.nrcs_staff_profiles;
insert into nrcs_permission_results
select 'anonymous', 'no_stories_visible', 0, count(*)::int from public.nrcs_stories;
insert into nrcs_permission_results
select 'anonymous', 'no_events_visible', 0, count(*)::int from public.nrcs_events;

do $$
declare
  failures int;
begin
  select count(*)
  into failures
  from nrcs_permission_results
  where expected <> actual;

  if failures > 0 then
    raise exception 'NRCS permission matrix failed: % mismatches', failures;
  end if;
end $$;

select * from nrcs_permission_results order by actor, check_name;

rollback;
