drop policy if exists "Alerts public read active window" on alerts;

create policy "Alerts public read active window"
on alerts for select
using (
  active = true
  and (start_at is null or start_at <= (now() at time zone 'America/Chicago'))
  and (end_at is null or end_at >= (now() at time zone 'America/Chicago'))
);
