drop index if exists public.events_nrcs_source_id_key;

alter table public.events
drop constraint if exists events_nrcs_source_id_key;

alter table public.events
add constraint events_nrcs_source_id_key unique (nrcs_source_id);
