begin;
alter table public.nrcs_events
  add column chamber_id uuid,
  add column chamber_highlight_type text,
  add constraint nrcs_event_chamber_highlight_pair check (
    (chamber_id is null and chamber_highlight_type is null) or
    (chamber_id is not null and chamber_highlight_type is not null
      and chamber_highlight_type in ('chamber_hosted', 'chamber_member'))
  );
notify pgrst, 'reload schema';
commit;
