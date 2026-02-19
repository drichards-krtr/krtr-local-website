alter table stories
add column if not exists tags text[] not null default '{}';

update stories
set tags = '{}'
where tags is null;

alter table stories
drop constraint if exists stories_tags_allowed;

alter table stories
add constraint stories_tags_allowed
check (
  tags <@ array[
    'dysart',
    'la-porte-city',
    'ucsd',
    'lpc-elementary',
    'dg-elementary',
    'ums',
    'uhs',
    'sports',
    'events'
  ]::text[]
);

create index if not exists stories_tags_gin on stories using gin (tags);
