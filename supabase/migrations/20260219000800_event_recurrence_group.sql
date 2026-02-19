alter table events
add column if not exists recurrence_group_id uuid null;

create index if not exists events_recurrence_group_start_idx
on events (recurrence_group_id, start_at);
