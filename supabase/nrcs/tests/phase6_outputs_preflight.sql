-- Read-only Phase 6 preflight. Run in NRCS SQL Editor before applying the migration.
select count(*) as existing_web_outputs from public.nrcs_web_outputs;

-- Both exception queries should return zero rows. Do not delete records to resolve conflicts.
select story_id,count(*) as output_count
from public.nrcs_web_outputs group by story_id having count(*)>1;

select s.district_key,o.slug,count(*) as conflicting_slug_count
from public.nrcs_web_outputs o join public.nrcs_stories s on s.id=o.story_id
where o.slug is not null group by s.district_key,o.slug having count(*)>1;

-- Informational only: existing instructions needing correction before their next save.
select o.id,o.story_id,o.status,o.slug,o.copy_version_id,o.scheduled_at,o.published_at
from public.nrcs_web_outputs o
where o.status<>'draft' and (
  o.copy_version_id is null or nullif(trim(o.slug),'') is null
  or o.status='scheduled' and o.scheduled_at is null
  or o.status='published' and o.published_at is null
);
