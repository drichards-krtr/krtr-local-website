begin;

alter table public.nrcs_event_classification_terms
  add column if not exists emoji text;

alter table public.nrcs_event_classification_terms
  drop constraint if exists nrcs_event_classification_terms_emoji_length;
alter table public.nrcs_event_classification_terms
  add constraint nrcs_event_classification_terms_emoji_length
  check (emoji is null or char_length(emoji) between 1 and 32);

update public.nrcs_event_classification_terms
set emoji = case
  when name = 'Football' then '🏈'
  when name = 'Volleyball' then '🏐'
  when name in ('Boys Cross Country', 'Girls Cross Country', 'Boys Track and Field', 'Girls Track and Field') then '🏃'
  when name in ('Boys Swimming', 'Girls Swimming') then '🏊'
  when name in ('Boys Tennis', 'Girls Tennis') then '🎾'
  when name in ('Boys Golf', 'Girls Golf') then '⛳'
  when name in ('Boys Basketball', 'Girls Basketball') then '🏀'
  when name in ('Boys Wrestling', 'Girls Wrestling') then '🤼'
  when name in ('Boys Bowling', 'Girls Bowling') then '🎳'
  when name in ('Boys Soccer', 'Girls Soccer') then '⚽'
  when name = 'Baseball' then '⚾'
  when name = 'Softball' then '🥎'
  when name = 'Dance' then '★'
  when name = 'Cheer' then '📣'
  when name = 'Band' then '🎺'
  when name = 'Choir' then '🎤'
  when name = 'Speech' then '🗣️'
  when name = 'Esports' then '🎮'
  when name = 'FFA' then '🌾'
  when name = 'City Council' then '🏛️'
  when name = 'School Board' then '🏫'
  when name = 'Library' then '📚'
  when name = 'Museum' then '🏛️'
  else emoji
end
where emoji is null;

comment on column public.nrcs_event_classification_terms.emoji is
  'Optional district-managed emoji or short symbol used by graphics and other classification displays.';

notify pgrst, 'reload schema';
commit;
