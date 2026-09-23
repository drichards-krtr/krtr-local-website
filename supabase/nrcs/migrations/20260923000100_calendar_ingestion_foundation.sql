-- TARGET: NRCS Supabase database. Apply before deploying Phase A NRCS code.
begin;
set local lock_timeout = '5s';

alter table public.nrcs_events alter column title drop not null,
  alter column start_at drop not null, alter column location_name drop not null,
  alter column address drop not null, alter column city drop not null,
  alter column state drop not null, alter column zip drop not null;
alter table public.nrcs_events drop constraint if exists nrcs_events_title_present;

-- A trigger avoids invalidating historical records while enforcing every new write.
create or replace function public.nrcs_validate_event_publication() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status='published' and (nullif(trim(new.title),'') is null or new.start_at is null
    or nullif(trim(new.location_name),'') is null or nullif(trim(new.address),'') is null
    or nullif(trim(new.city),'') is null or nullif(trim(new.state),'') is null
    or nullif(trim(new.zip),'') is null) then
    raise exception 'Publishing requires title, start time, location name, address, city, state, and ZIP.';
  end if;
  if new.classification_term_id is not null then
    if not exists(select 1 from nrcs_event_classification_terms t where t.id=new.classification_term_id
      and t.district_key=new.district_key) then raise exception 'Classification must belong to the Event district.'; end if;
    if (TG_OP='INSERT' or new.classification_term_id is distinct from old.classification_term_id)
      and not exists(select 1 from nrcs_event_classification_terms t where t.id=new.classification_term_id and t.enabled)
      then raise exception 'Disabled classifications cannot be assigned to new Events.'; end if;
  end if;
  return new;
end $$;
create trigger nrcs_validate_event_publication before insert or update on public.nrcs_events
for each row execute function public.nrcs_validate_event_publication();

create table public.nrcs_calendar_sources (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key),
  name text not null check(length(trim(name)) between 1 and 200),
  adapter_type text not null check(adapter_type in ('bound','ical','rss','google_calendar','generic_web','browser_web','facebook_events','facebook_posts','facebook_explore')),
  url text not null check(url ~ '^https?://'),
  feed_url text null check(feed_url is null or feed_url ~ '^https?://'),
  provider text null, extraction_notes text null,
  default_event_type_id uuid null references public.nrcs_event_classification_terms(id),
  enabled boolean not null default false,
  last_checked_at timestamptz, last_success_at timestamptz, last_status text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,district_key)
);
create trigger nrcs_calendar_sources_updated before update on public.nrcs_calendar_sources
for each row execute function public.nrcs_set_updated_at();

create table public.nrcs_calendar_source_runs (
  id uuid primary key,
  source_id uuid not null,
  district_key text not null,
  status text not null check(status in ('success','partial','failed')),
  inventory_complete boolean not null default false,
  window_start timestamptz not null, window_end timestamptz not null,
  completed_at timestamptz not null default now(),
  events_found integer not null default 0,
  new_candidates integer not null default 0,
  error_message text, payload_hash text not null,
  foreign key(source_id,district_key) references public.nrcs_calendar_sources(id,district_key),
  check(window_end>window_start and window_end<=window_start+interval '90 days'),
  check(not inventory_complete or status='success'),
  unique(id,source_id,district_key)
);
create table public.nrcs_calendar_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null, source_run_id uuid not null, district_key text not null,
  external_event_id text not null,
  evidence_hash text not null,
  candidate_type text not null check(candidate_type in ('new','update')),
  status text not null default 'pending' check(status in ('pending','approved','rejected','needs_attention')),
  fields jsonb not null, source_excerpt text, raw_payload jsonb not null default '{}',
  event_id uuid references public.nrcs_events(id),
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  reviewed_by uuid references public.nrcs_staff_profiles(id), expires_at timestamptz,
  foreign key(source_id,district_key) references public.nrcs_calendar_sources(id,district_key),
  foreign key(source_run_id,source_id,district_key) references public.nrcs_calendar_source_runs(id,source_id,district_key),
  unique(source_id,external_event_id,evidence_hash)
);
create table public.nrcs_calendar_event_sources (
  source_id uuid not null references public.nrcs_calendar_sources(id),
  external_event_id text not null,
  event_id uuid not null references public.nrcs_events(id),
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  primary key(source_id,external_event_id)
);
create index on public.nrcs_calendar_candidates(district_key,status,created_at desc);
create index on public.nrcs_calendar_source_runs(source_id,completed_at desc);

alter table public.nrcs_calendar_sources enable row level security;
alter table public.nrcs_calendar_source_runs enable row level security;
alter table public.nrcs_calendar_candidates enable row level security;
alter table public.nrcs_calendar_event_sources enable row level security;
create policy calendar_sources_read on public.nrcs_calendar_sources for select to authenticated
using(nrcs_has_role('editor') and nrcs_can_access_district(district_key));
create policy calendar_sources_insert on public.nrcs_calendar_sources for insert to authenticated
with check(nrcs_has_role('editor') and nrcs_can_access_district(district_key));
create policy calendar_sources_update on public.nrcs_calendar_sources for update to authenticated
using(nrcs_has_role('editor') and nrcs_can_access_district(district_key))
with check(nrcs_has_role('editor') and nrcs_can_access_district(district_key));
create policy calendar_runs_read on public.nrcs_calendar_source_runs for select to authenticated
using(nrcs_has_role('editor') and nrcs_can_access_district(district_key));
create policy calendar_candidates_read on public.nrcs_calendar_candidates for select to authenticated
using(nrcs_has_role('editor') and nrcs_can_access_district(district_key));
create policy calendar_event_sources_read on public.nrcs_calendar_event_sources for select to authenticated
using(exists(select 1 from nrcs_calendar_sources s where s.id=source_id and nrcs_has_role('editor') and nrcs_can_access_district(s.district_key)));
grant select,insert,update on public.nrcs_calendar_sources to authenticated;
grant select on public.nrcs_calendar_source_runs,public.nrcs_calendar_candidates,public.nrcs_calendar_event_sources to authenticated;
grant all on public.nrcs_calendar_sources,public.nrcs_calendar_source_runs,public.nrcs_calendar_candidates,public.nrcs_calendar_event_sources to service_role;

-- Service-only, atomic run submission. The HTTP integration credential never reaches this database.
create or replace function public.nrcs_receive_calendar_run(p_run jsonb, p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s nrcs_calendar_sources; existing nrcs_calendar_source_runs; item jsonb; linked uuid; added integer:=0; affected integer;
begin
  select * into s from nrcs_calendar_sources where id=(p_run->>'source_id')::uuid for update;
  if s.id is null or not s.enabled or not exists(select 1 from nrcs_districts where district_key=s.district_key and enabled)
    then raise exception 'Source or district is disabled or missing'; end if;
  select * into existing from nrcs_calendar_source_runs where id=(p_run->>'run_id')::uuid;
  if existing.id is not null then
    if existing.source_id<>s.id or existing.payload_hash<>p_hash then raise exception 'Run ID already used for different content'; end if;
    return jsonb_build_object('run_id',existing.id,'new_candidates',existing.new_candidates,'replayed',true);
  end if;
  insert into nrcs_calendar_source_runs(id,source_id,district_key,status,inventory_complete,window_start,window_end,events_found,error_message,payload_hash)
  values((p_run->>'run_id')::uuid,s.id,s.district_key,p_run->>'status',
    coalesce((p_run->>'inventory_complete')::boolean,false) and s.adapter_type<>'facebook_explore',
    (p_run->>'window_start')::timestamptz,(p_run->>'window_end')::timestamptz,
    jsonb_array_length(p_run->'candidates'),p_run->>'error_message',p_hash);
  for item in select value from jsonb_array_elements(p_run->'candidates') loop
    linked:=null;
    select event_id into linked from nrcs_calendar_event_sources where source_id=s.id and external_event_id=item->>'external_event_id';
    insert into nrcs_calendar_candidates(source_id,source_run_id,district_key,external_event_id,evidence_hash,candidate_type,fields,source_excerpt,raw_payload,event_id)
    values(s.id,(p_run->>'run_id')::uuid,s.district_key,item->>'external_event_id',item->>'evidence_hash',
      case when linked is null then 'new' else 'update' end,item->'fields',item->>'source_excerpt',coalesce(item->'raw_payload','{}'),linked)
    on conflict(source_id,external_event_id,evidence_hash) do nothing;
    get diagnostics affected = row_count; added:=added+affected;
    update nrcs_calendar_event_sources set last_seen_at=now() where source_id=s.id and external_event_id=item->>'external_event_id';
  end loop;
  update nrcs_calendar_source_runs set new_candidates=added where id=(p_run->>'run_id')::uuid;
  update nrcs_calendar_sources set last_checked_at=now(),last_status=p_run->>'status',last_error=p_run->>'error_message',
    last_success_at=case when p_run->>'status'='success' then now() else last_success_at end where id=s.id;
  return jsonb_build_object('run_id',p_run->>'run_id','new_candidates',added,'replayed',false);
end $$;
revoke all on function public.nrcs_receive_calendar_run(jsonb,text) from public,anon,authenticated;
grant execute on function public.nrcs_receive_calendar_run(jsonb,text) to service_role;

-- Approval creates only a draft. Existing-event changes remain staged for later review.
create or replace function public.nrcs_review_calendar_candidate(p_id uuid,p_action text) returns uuid
language plpgsql security definer set search_path=public as $$
declare c nrcs_calendar_candidates; s nrcs_calendar_sources; result uuid; f jsonb;
begin
  select * into c from nrcs_calendar_candidates where id=p_id for update;
  if c.id is null or not nrcs_has_role('editor') or not nrcs_can_access_district(c.district_key)
    then raise exception 'Candidate unavailable or permission denied'; end if;
  if p_action is null or p_action not in ('approve','reject') then raise exception 'Invalid review action'; end if;
  if c.status='approved' and p_action='approve' then return c.event_id; end if;
  if c.status='rejected' and p_action='reject' then return null; end if;
  if c.status not in ('pending','needs_attention') then raise exception 'Candidate already reviewed'; end if;
  if p_action='reject' then
    update nrcs_calendar_candidates set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),expires_at=now()+interval '90 days' where id=c.id;
    return null;
  end if;
  select * into s from nrcs_calendar_sources where id=c.source_id for update;
  select event_id into result from nrcs_calendar_event_sources where source_id=c.source_id and external_event_id=c.external_event_id;
  if result is not null then
    -- No automatic change to the canonical record, especially published/archived Events.
    update nrcs_calendar_candidates set status='needs_attention',candidate_type='update',event_id=result where id=c.id;
    return null;
  end if;
  if s.default_event_type_id is not null and not exists(select 1 from nrcs_event_classification_terms
    where id=s.default_event_type_id and district_key=s.district_key and enabled) then
    raise exception 'Source classification is disabled or belongs to another district. Edit the source before approval.';
  end if;
  f:=c.fields;
  insert into nrcs_events(district_key,title,body_html,location_name,address,city,state,zip,start_at,end_at,status,classification_term_id,created_by)
  values(c.district_key,nullif(f->>'title',''),f->>'body_html',nullif(f->>'location_name',''),nullif(f->>'address',''),
    nullif(f->>'city',''),nullif(f->>'state',''),nullif(f->>'zip',''),nullif(f->>'start_at','')::timestamp,
    nullif(f->>'end_at','')::timestamp,'draft',s.default_event_type_id,auth.uid()) returning id into result;
  insert into nrcs_calendar_event_sources(source_id,external_event_id,event_id) values(c.source_id,c.external_event_id,result);
  update nrcs_calendar_candidates set status='approved',event_id=result,reviewed_at=now(),reviewed_by=auth.uid() where id=c.id;
  return result;
end $$;
revoke all on function public.nrcs_review_calendar_candidate(uuid,text) from public,anon;
grant execute on function public.nrcs_review_calendar_candidate(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
