alter table stories
add column if not exists video_orientation text not null default 'vertical';

alter table stories
drop constraint if exists stories_video_orientation_allowed;

alter table stories
add constraint stories_video_orientation_allowed
check (video_orientation in ('vertical', 'horizontal'));
