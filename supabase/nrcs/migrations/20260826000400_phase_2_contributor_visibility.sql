drop policy if exists "NRCS events district read" on public.nrcs_events;
create policy "NRCS events role read"
on public.nrcs_events for select
using (
  public.nrcs_can_access_district(district_key)
  and (
    public.nrcs_has_role('editor')
    or created_by = auth.uid()
    or status = 'published'
  )
);

comment on policy "NRCS events role read" on public.nrcs_events is
  'Contributors can read their own events and published district events. Editors/Admins can read accessible district events.';
