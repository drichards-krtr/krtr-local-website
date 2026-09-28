alter table public.nrcs_events
  add column if not exists notes text null;

comment on column public.nrcs_events.notes is
  'Internal newsroom notes. Never included in the CMS event projection or public calendar.';
