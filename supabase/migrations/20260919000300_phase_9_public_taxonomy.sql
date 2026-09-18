begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

-- Keep canonical definitions while projecting aliases into the existing public filter array.
create function public.nrcs_project_tag_aliases() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.editorial_origin='nrcs' then
    select coalesce(array_agg(distinct slug order by slug),'{}'::text[]) into new.tags
    from (
      select tag->>'slug' slug from jsonb_array_elements(coalesce(new.nrcs_tags,'[]'::jsonb)) tag
      union
      select alias from jsonb_array_elements(coalesce(new.nrcs_tags,'[]'::jsonb)) tag
      cross join lateral jsonb_array_elements_text(coalesce(tag->'aliases','[]'::jsonb)) alias
    ) definitions where slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
  end if;
  return new;
end $$;
create trigger nrcs_project_tag_aliases before insert or update of nrcs_tags,editorial_origin,tags
on public.stories for each row execute function public.nrcs_project_tag_aliases();
notify pgrst,'reload schema';
commit;
