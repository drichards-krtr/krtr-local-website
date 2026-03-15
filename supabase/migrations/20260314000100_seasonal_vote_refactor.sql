create table if not exists vote_page_content (
  id integer primary key check (id = 1),
  body_markdown text not null default '',
  updated_at timestamp not null default now()
);

insert into vote_page_content (id, body_markdown)
values (1, '')
on conflict (id) do nothing;

alter table vote_candidates
add column if not exists jurisdiction_name text not null default '',
add column if not exists seat_label text null;

update vote_candidates c
set jurisdiction_name = coalesce(j.label, c.jurisdiction_name, '')
from vote_jurisdictions j
where j.slug = c.jurisdiction_slug
  and coalesce(c.jurisdiction_name, '') = '';

update vote_candidates c
set seat_label = concat_ws(
  ' | ',
  nullif(
    concat(
      s.seat_key,
      case when coalesce(s.seat_name, '') <> '' then concat(' (', s.seat_name, ')') else '' end
    ),
    ''
  ),
  case when s.term_years is not null then concat(s.term_years, '-year term') else null end
)
from vote_seats s
where s.id = c.seat_id
  and c.seat_label is null;

drop trigger if exists vote_page_content_set_updated_at on vote_page_content;
create trigger vote_page_content_set_updated_at
before update on vote_page_content
for each row execute procedure set_updated_at();

alter table vote_page_content enable row level security;

drop policy if exists "Vote page content public read" on vote_page_content;
create policy "Vote page content public read"
on vote_page_content for select
using (true);

drop policy if exists "Vote page content admin full" on vote_page_content;
create policy "Vote page content admin full"
on vote_page_content for all
using (public.is_admin())
with check (public.is_admin());
