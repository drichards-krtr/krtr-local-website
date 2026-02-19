alter table stories
add column if not exists slug text;

update stories
set slug = id::text
where slug is null or slug = '';

create unique index if not exists stories_slug_unique_idx on stories (slug);
