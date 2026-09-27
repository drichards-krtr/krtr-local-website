create or replace function public.nrcs_has_role(required_role public.nrcs_staff_role)
returns boolean as $$
  select case
    when public.nrcs_current_role() = 'admin' then true
    when required_role = 'contributor' and public.nrcs_current_role() in ('editor', 'producer', 'contributor') then true
    when required_role = 'producer' and public.nrcs_current_role() in ('editor', 'producer') then true
    when required_role = 'editor' and public.nrcs_current_role() = 'editor' then true
    else false
  end;
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_can_read_story(requested_story_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.nrcs_stories s
    where s.id = requested_story_id
      and public.nrcs_can_access_district(s.district_key)
      and (public.nrcs_has_role('producer') or s.created_by = auth.uid() or s.lifecycle_state = 'active')
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.nrcs_can_write_story(requested_story_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.nrcs_stories s
    where s.id = requested_story_id
      and public.nrcs_can_access_district(s.district_key)
      and (public.nrcs_has_role('producer') or s.created_by = auth.uid())
  );
$$ language sql stable security definer set search_path = public;

drop policy if exists "NRCS programs producer read" on public.nrcs_programs;
create policy "NRCS programs producer read" on public.nrcs_programs for select
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS templates producer read" on public.nrcs_program_templates;
create policy "NRCS templates producer read" on public.nrcs_program_templates for select
using (public.nrcs_has_role('producer') and exists (
  select 1 from public.nrcs_programs p where p.id = program_id and public.nrcs_can_access_district(p.district_key)
));

drop policy if exists "NRCS template items producer read" on public.nrcs_program_template_items;
create policy "NRCS template items producer read" on public.nrcs_program_template_items for select
using (public.nrcs_has_role('producer') and exists (
  select 1 from public.nrcs_program_templates t join public.nrcs_programs p on p.id = t.program_id
  where t.id = template_id and public.nrcs_can_access_district(p.district_key)
));

drop policy if exists "NRCS editions producer read" on public.nrcs_editions;
create policy "NRCS editions producer read" on public.nrcs_editions for select
using (public.nrcs_has_role('producer') and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS editions producer insert" on public.nrcs_editions;
create policy "NRCS editions producer insert" on public.nrcs_editions for insert
with check (public.nrcs_has_role('producer') and not public.nrcs_has_role('editor')
  and status <> 'archived' and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS editions producer update" on public.nrcs_editions;
create policy "NRCS editions producer update" on public.nrcs_editions for update
using (public.nrcs_has_role('producer') and not public.nrcs_has_role('editor')
  and status <> 'archived' and public.nrcs_can_access_district(district_key))
with check (public.nrcs_has_role('producer') and not public.nrcs_has_role('editor')
  and status <> 'archived' and public.nrcs_can_access_district(district_key));

drop policy if exists "NRCS rundown items producer read" on public.nrcs_rundown_items;
create policy "NRCS rundown items producer read" on public.nrcs_rundown_items for select
using (public.nrcs_has_role('producer') and exists (
  select 1 from public.nrcs_editions e where e.id = edition_id and public.nrcs_can_access_district(e.district_key)
));

drop policy if exists "NRCS rundown items producer insert" on public.nrcs_rundown_items;
create policy "NRCS rundown items producer insert" on public.nrcs_rundown_items for insert
with check (public.nrcs_has_role('producer') and not public.nrcs_has_role('editor') and exists (
  select 1 from public.nrcs_editions e where e.id = edition_id and e.status <> 'archived'
    and public.nrcs_can_access_district(e.district_key)
));

drop policy if exists "NRCS rundown items producer update" on public.nrcs_rundown_items;
create policy "NRCS rundown items producer update" on public.nrcs_rundown_items for update
using (public.nrcs_has_role('producer') and not public.nrcs_has_role('editor') and exists (
  select 1 from public.nrcs_editions e where e.id = edition_id and e.status <> 'archived'
    and public.nrcs_can_access_district(e.district_key)
))
with check (public.nrcs_has_role('producer') and not public.nrcs_has_role('editor') and exists (
  select 1 from public.nrcs_editions e where e.id = edition_id and e.status <> 'archived'
    and public.nrcs_can_access_district(e.district_key)
));

drop policy if exists "NRCS events contributor update" on public.nrcs_events;
create policy "NRCS events contributor update" on public.nrcs_events for update
using (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key)
  and (public.nrcs_has_role('editor') or status <> 'archived'))
with check (public.nrcs_has_role('contributor') and public.nrcs_can_access_district(district_key)
  and (public.nrcs_has_role('editor') or status <> 'archived'));

comment on type public.nrcs_staff_role is
  'Contributor owns limited work; producer performs district editorial production without destructive administration; editor manages publication/configuration; admin manages the system.';
