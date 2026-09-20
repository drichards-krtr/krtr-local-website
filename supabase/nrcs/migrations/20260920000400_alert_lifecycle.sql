begin;

alter table public.nrcs_priority_alerts
  add column if not exists archived_at timestamptz;

create index if not exists nrcs_alert_district_archive_idx
  on public.nrcs_priority_alerts(district_key,archived_at,updated_at desc);

create or replace function public.nrcs_validate_priority_alert() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('priority-alert:'||new.district_key,0));
  if TG_OP='UPDATE' and new.district_key<>old.district_key then raise exception 'Alert district cannot change'; end if;
  if new.archived_at is not null and new.active then raise exception 'Archived Alerts cannot be enabled'; end if;
  if new.active and exists(select 1 from public.nrcs_priority_alerts a where a.district_key=new.district_key and a.active and a.id<>new.id and a.archived_at is null and tstzrange(a.start_at,a.end_at,'[)') && tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'Another enabled alert overlaps this schedule. Disable it or adjust the times'; end if;
  if new.target_type='story' and not exists(select 1 from public.nrcs_web_outputs o where o.story_id=new.target_id and o.district_key=new.district_key and o.status='published') then raise exception 'Alert Story target must have a published Web Output in this district'; end if;
  if new.target_type='event' and not exists(select 1 from public.nrcs_events e where e.id=new.target_id and e.district_key=new.district_key and e.status::text='published') then raise exception 'Alert Event target must be published in this district'; end if;
  new.revision:=case when TG_OP='UPDATE' then old.revision+1 else 1 end;
  new.updated_at:=now(); return new;
end $$;

create or replace function public.nrcs_delete_undelivered_alert(p_id uuid,p_revision integer) returns boolean
language plpgsql security invoker set search_path=public as $$
declare target public.nrcs_priority_alerts;
begin
  select * into target from public.nrcs_priority_alerts where id=p_id for update;
  if target.id is null then return false; end if;
  if not public.nrcs_has_role('editor') or not public.nrcs_can_access_district(target.district_key) then raise exception 'Editors/admins only'; end if;
  if target.revision<>p_revision then raise exception 'Alert changed. Reload before deleting'; end if;
  if target.active then raise exception 'Disable or archive the Alert before deleting'; end if;
  if exists(select 1 from public.nrcs_publication_deliveries d where d.kind='alert' and d.source_id=target.id::text) then raise exception 'Delivered Alerts must remain auditable'; end if;
  delete from public.nrcs_priority_alerts where id=target.id;
  return true;
end $$;
revoke all on function public.nrcs_delete_undelivered_alert(uuid,integer) from public,anon;
grant execute on function public.nrcs_delete_undelivered_alert(uuid,integer) to authenticated;

commit;
