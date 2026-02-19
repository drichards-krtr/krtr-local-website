update stories
set tags = array_remove(tags, 'events')
where tags @> array['events']::text[];

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
    'sports'
  ]::text[]
);
