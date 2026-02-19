alter table event_submitters
add column if not exists submitted_event_id uuid null references events(id) on delete set null;

create index if not exists event_submitters_submitted_event_id_idx
on event_submitters (submitted_event_id);
