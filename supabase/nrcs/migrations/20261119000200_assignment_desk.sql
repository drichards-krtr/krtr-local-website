create table public.nrcs_radar (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key),
  title text not null check (length(trim(title)) between 1 and 500),
  details text not null default '',
  created_by uuid references public.nrcs_staff_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  legacy_row jsonb,
  legacy_key text unique,
  unique (id, district_key)
);

create table public.nrcs_assignments (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.nrcs_districts(district_key),
  title text not null check (length(trim(title)) between 1 and 500),
  details text not null default '',
  decision text not null default 'pending'
    check (decision in ('pending','skip','hold','need_more_info','assigned','legacy_do','legacy_conditional')),
  decision_note text not null default '',
  decided_at timestamptz,
  decided_by uuid references public.nrcs_staff_profiles(id) on delete set null,
  owner_id uuid references public.nrcs_staff_profiles(id) on delete set null,
  story_id uuid unique references public.nrcs_stories(id) on delete set null,
  radar_id uuid,
  created_by uuid references public.nrcs_staff_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  legacy_row jsonb,
  legacy_key text unique,
  foreign key (radar_id, district_key) references public.nrcs_radar(id, district_key)
);

create index on public.nrcs_radar (district_key, created_at desc, id);
create index on public.nrcs_assignments (district_key, created_at desc, id);

alter table public.nrcs_radar enable row level security;
alter table public.nrcs_assignments enable row level security;
revoke all on public.nrcs_radar, public.nrcs_assignments from anon, authenticated;
grant select on public.nrcs_radar, public.nrcs_assignments to authenticated;
grant insert (district_key, title, details) on public.nrcs_radar, public.nrcs_assignments to authenticated;

create policy radar_read on public.nrcs_radar for select
  using (public.nrcs_can_access_district(district_key));
create policy assignments_read on public.nrcs_assignments for select
  using (public.nrcs_can_access_district(district_key));
create policy radar_submit on public.nrcs_radar for insert
  with check (public.nrcs_can_access_district(district_key));
create policy assignments_submit on public.nrcs_assignments for insert
  with check (public.nrcs_can_access_district(district_key));

create function public.nrcs_assignment_owners(p_district text)
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, coalesce(nullif(p.display_name,''),p.email)
  from public.nrcs_staff_profiles p
  where p.active and public.nrcs_has_role('producer')
    and public.nrcs_can_access_district(p_district)
    and exists (select 1 from public.nrcs_districts d where d.enabled and d.district_key = p_district)
    and (p.role = 'admin' or exists (
      select 1 from public.nrcs_staff_districts sd
      where sd.staff_id = p.id and sd.district_key = p_district
    ))
  order by 2, 1;
$$;

create function public.nrcs_radar_action(p_id uuid, p_archive boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  item public.nrcs_radar%rowtype;
  assignment_id uuid;
begin
  select * into item from public.nrcs_radar
    where id = p_id and public.nrcs_can_access_district(district_key)
    for update;
  if not found then raise exception 'Radar entry is unavailable'; end if;
  if p_archive then
    if not public.nrcs_has_role('producer') then raise exception 'Producer access required'; end if;
    update public.nrcs_radar set archived_at = now() where id = item.id and archived_at is null;
    return item.id;
  end if;
  if item.archived_at is not null then raise exception 'Radar entry is archived'; end if;
  insert into public.nrcs_assignments (district_key, title, details, radar_id)
    values (item.district_key, item.title, item.details, item.id)
    returning id into assignment_id;
  return assignment_id;
end;
$$;

create function public.nrcs_decide_assignment(
  p_id uuid, p_decision text, p_owner uuid, p_note text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  item public.nrcs_assignments%rowtype;
  story uuid;
  stream uuid;
  version uuid;
  kind public.nrcs_copy_stream_type;
begin
  if not public.nrcs_has_role('producer') then raise exception 'Producer access required'; end if;
  if p_decision is null or p_decision not in ('skip','hold','need_more_info','assigned') then
    raise exception 'Invalid decision';
  end if;
  select * into item from public.nrcs_assignments
    where id = p_id and public.nrcs_can_access_district(district_key)
    for update;
  if not found then raise exception 'Assignment is unavailable'; end if;
  if item.story_id is not null then
    if p_decision = 'assigned' and p_owner = item.owner_id then return item.story_id; end if;
    raise exception 'This assignment already has a story';
  end if;
  if p_decision = 'assigned' then
    if not exists (select 1 from public.nrcs_assignment_owners(item.district_key) where id = p_owner) then
      raise exception 'Choose an active owner with access to this district';
    end if;
    -- Story visibility and editing use created_by for contributors.
    insert into public.nrcs_stories (district_key,title,lifecycle_state,created_by,updated_by)
      values (item.district_key,item.title,'reporting',p_owner,auth.uid()) returning id into story;
    insert into public.nrcs_story_facts (story_id,body_html,created_by,updated_by)
      values (story,replace(replace(replace(replace(item.details,'&','&amp;'),'<','&lt;'),'>','&gt;'),chr(10),'<br>'),auth.uid(),auth.uid());
    foreach kind in array enum_range(null::public.nrcs_copy_stream_type) loop
      insert into public.nrcs_copy_streams (story_id,stream_type) values (story,kind) returning id into stream;
      insert into public.nrcs_copy_versions (stream_id,version_number,headline,created_by)
        values (stream,1,case when kind = 'web' then item.title end,auth.uid()) returning id into version;
      update public.nrcs_copy_streams set current_version_id = version where id = stream;
    end loop;
  end if;
  update public.nrcs_assignments set decision = p_decision, story_id = story,
    owner_id = case when story is not null then p_owner end,
    decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note,'')
    where id = item.id;
  return story;
end;
$$;

revoke execute on function public.nrcs_assignment_owners(text),
  public.nrcs_radar_action(uuid,boolean), public.nrcs_decide_assignment(uuid,text,uuid,text) from public, anon;
grant execute on function public.nrcs_assignment_owners(text),
  public.nrcs_radar_action(uuid,boolean), public.nrcs_decide_assignment(uuid,text,uuid,text) to authenticated;
