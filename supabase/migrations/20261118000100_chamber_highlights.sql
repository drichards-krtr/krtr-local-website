begin;
set local lock_timeout = '5s';

create table public.chamber_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  city text not null check (length(trim(city)) between 1 and 200),
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  active boolean not null default false
);

create table public.chamber_district_coverage (
  chamber_id uuid not null references public.chamber_accounts(id),
  district_key text not null references public.districts(district_key) on update cascade,
  active boolean not null default false,
  primary key (chamber_id, district_key)
);

alter table public.chamber_accounts enable row level security;
alter table public.chamber_district_coverage enable row level security;
revoke all on public.chamber_accounts, public.chamber_district_coverage from public, anon, authenticated;
grant select, insert, update on public.chamber_accounts, public.chamber_district_coverage to service_role;

alter table public.events
  add column chamber_id uuid references public.chamber_accounts(id),
  add column chamber_highlight_type text,
  add constraint event_chamber_highlight_pair check (
    (chamber_id is null and chamber_highlight_type is null) or
    (chamber_id is not null and chamber_highlight_type is not null
      and chamber_highlight_type in ('chamber_hosted', 'chamber_member'))
  );

create function public.chamber_event_label(event public.events) returns text
language sql stable security definer set search_path = '' as $$
  select case ($1).chamber_highlight_type
    when 'chamber_hosted' then 'Event Hosted by the ' || account.name
    when 'chamber_member' then 'Member of the ' || account.name
  end
  from public.chamber_accounts account
  join public.chamber_district_coverage coverage on coverage.chamber_id = account.id
  where account.id = ($1).chamber_id and account.active and coverage.active
    and coverage.district_key = ($1).district_key and ($1).status = 'published'
$$;
revoke all on function public.chamber_event_label(public.events) from public;
grant execute on function public.chamber_event_label(public.events) to anon, authenticated, service_role;

-- Save the account and its complete coverage list in a single transaction.
-- Existing districts omitted from the list are disabled and retained for retries/history.
create function public.save_chamber_account(p_account jsonb, p_coverage jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  account_id uuid := (p_account->>'id')::uuid;
  affected jsonb;
begin
  insert into public.chamber_accounts(id, name, city, contact_name, contact_email, contact_phone, notes, active)
  values (account_id, p_account->>'name', p_account->>'city', p_account->>'contact_name',
    p_account->>'contact_email', p_account->>'contact_phone', p_account->>'notes', (p_account->>'active')::boolean)
  on conflict (id) do update set
    name = excluded.name, city = excluded.city, contact_name = excluded.contact_name,
    contact_email = excluded.contact_email, contact_phone = excluded.contact_phone,
    notes = excluded.notes, active = excluded.active;

  update public.chamber_district_coverage set active = false
    where chamber_id = account_id and not (p_coverage ? district_key);

  insert into public.chamber_district_coverage(chamber_id, district_key, active)
  select account_id, key, value::boolean from jsonb_each_text(p_coverage)
  on conflict (chamber_id, district_key) do update set active = excluded.active;

  select coalesce(jsonb_agg(district_key order by district_key), '[]'::jsonb) into affected
    from public.chamber_district_coverage where chamber_id = account_id;
  return jsonb_build_object('id', account_id, 'affected_districts', affected);
end $$;
revoke all on function public.save_chamber_account(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_chamber_account(jsonb,jsonb) to service_role;

-- Allow district moves only for projections already owned by the same NRCS event.
create or replace function public.receive_nrcs_event(p_event jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved public.events; linked public.events; term uuid; target uuid; previous_district text;
begin
  perform pg_advisory_xact_lock(hashtextextended('nrcs-event:'||(p_event->>'id'),0));
  select * into linked from public.events where nrcs_source_id=(p_event->>'id')::uuid for update;
  if p_event->>'cms_event_id' is not null then
    if linked.id is not null and linked.id<>(p_event->>'cms_event_id')::uuid then raise exception 'CMS Event identity conflict'; end if;
    select * into linked from public.events where id=(p_event->>'cms_event_id')::uuid for update;
    if linked.id is null or (linked.nrcs_source_id is null and linked.district_key<>p_event->>'district_key') then raise exception 'Linked CMS Event missing or belongs to another district'; end if;
    if linked.nrcs_source_id is not null and linked.nrcs_source_id<>(p_event->>'id')::uuid then raise exception 'CMS Event already linked to another NRCS Event'; end if;
  end if;
  previous_district:=linked.district_key;
  target:=coalesce(linked.id,gen_random_uuid());
  insert into public.events(id,nrcs_source_id,district_key,title,description,body_html,location_name,address,city,state,zip,location,start_at,end_at,image_url,status,is_school_sports)
  values(target,(p_event->>'id')::uuid,p_event->>'district_key',p_event->>'title',p_event->>'description',p_event->>'body_html',p_event->>'location_name',p_event->>'address',p_event->>'city',p_event->>'state',p_event->>'zip',p_event->>'location',(p_event->>'start_at')::timestamp,nullif(p_event->>'end_at','')::timestamp,p_event->>'image_url',p_event->>'status',coalesce(p_event->'classification'->>'kind'='sport',false))
  on conflict(id) do update set nrcs_source_id=excluded.nrcs_source_id,district_key=excluded.district_key,title=excluded.title,description=excluded.description,body_html=excluded.body_html,location_name=excluded.location_name,address=excluded.address,city=excluded.city,state=excluded.state,zip=excluded.zip,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,image_url=excluded.image_url,status=excluded.status,is_school_sports=excluded.is_school_sports returning * into saved;
  if p_event ? 'chamber_id' then
    update public.events set chamber_id=(p_event->>'chamber_id')::uuid,
      chamber_highlight_type=p_event->>'chamber_highlight_type' where id=saved.id;
  end if;
  delete from public.event_classification_assignments where event_id=saved.id;
  if p_event->'classification' is not null and p_event->'classification'<>'null'::jsonb then
    insert into public.event_classification_terms(district_key,kind,name,enabled) values(saved.district_key,(p_event->'classification'->>'kind')::public.event_classification_kind,p_event->'classification'->>'name',(p_event->'classification'->>'enabled')::boolean)
    on conflict(district_key,kind,name) do update set enabled=excluded.enabled returning id into term;
    insert into public.event_classification_assignments(event_id,term_id) values(saved.id,term);
  end if;
  return jsonb_build_object('id',saved.id,'nrcs_source_id',saved.nrcs_source_id,'district_key',saved.district_key,'status',saved.status,'previous_district_key',previous_district);
end $$;
revoke all on function public.receive_nrcs_event(jsonb) from public,anon,authenticated;
grant execute on function public.receive_nrcs_event(jsonb) to service_role;

create or replace function public.hide_nrcs_event(p_id uuid,p_district text,p_status text,p_cms_event_id uuid default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare saved public.events; previous_district text;
begin
  if p_status not in ('draft','archived') then raise exception 'Invalid hidden Event status'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nrcs-event:'||p_id::text,0));
  select * into saved from events where nrcs_source_id=p_id for update;
  if p_cms_event_id is not null then
    if saved.id is not null and saved.id<>p_cms_event_id then raise exception 'CMS Event identity conflict'; end if;
    select * into saved from events where id=p_cms_event_id for update;
    if saved.id is null or (saved.nrcs_source_id is null and saved.district_key<>p_district) then raise exception 'Linked CMS Event missing or belongs to another district'; end if;
    if saved.nrcs_source_id is not null and saved.nrcs_source_id<>p_id then raise exception 'CMS Event already linked to another NRCS Event'; end if;
  end if;
  if saved.id is not null then
    previous_district:=saved.district_key;
    update events set status=p_status,nrcs_source_id=p_id,district_key=p_district where id=saved.id returning * into saved;
  end if;
  return jsonb_build_object('id',saved.id,'nrcs_source_id',p_id,'district_key',p_district,'status',p_status,'previous_district_key',previous_district);
end $$;
revoke all on function public.hide_nrcs_event(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.hide_nrcs_event(uuid,text,text,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
