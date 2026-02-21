alter table events
add column if not exists link_1_url text null,
add column if not exists link_1_text text null,
add column if not exists link_2_url text null,
add column if not exists link_2_text text null;
