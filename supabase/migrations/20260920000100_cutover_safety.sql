begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
create table public.editorial_authority (
  singleton boolean primary key default true check(singleton),
  legacy_writes_enabled boolean not null default true
);
insert into public.editorial_authority values(true,true);
alter table public.editorial_authority enable row level security;
create policy authority_read on public.editorial_authority for select using(true);
revoke all on public.editorial_authority from anon,authenticated;
grant select on public.editorial_authority to anon,authenticated;
grant select,update on public.editorial_authority to service_role;

create function public.guard_legacy_editorial_write() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if current_user not in ('service_role','postgres','supabase_admin')
    and not coalesce((select legacy_writes_enabled from public.editorial_authority where singleton),false) then
    raise exception 'Legacy editorial writes are disabled; use NRCS' using errcode='42501';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
do $$ declare name text; begin
  foreach name in array array['stories','events','dailys','story_slots','alerts','event_classification_terms','event_classification_assignments'] loop
    execute format('create trigger guard_legacy_editorial_write before insert or update or delete on public.%I for each row execute function public.guard_legacy_editorial_write()',name);
    execute format('create trigger guard_legacy_editorial_truncate before truncate on public.%I for each statement execute function public.guard_legacy_editorial_write()',name);
  end loop;
end $$;

alter table public.stories add column if not exists seo_title text;
alter table public.stories add column if not exists seo_description text;
create function public.nrcs_story_public_fields() returns trigger
language plpgsql security invoker set search_path=public as $$
declare payload jsonb;
begin
  if new.editorial_origin='nrcs' then
    new.mux_upload_id:=null;
    if current_user in ('service_role','postgres','supabase_admin') then
      select package->'payload' into payload from public.nrcs_publication_projections
        where kind='web' and source_id=new.nrcs_output_id::text
        and district_key=new.district_key and revision=new.nrcs_revision;
      new.seo_title:=payload->>'seo_title'; new.seo_description:=payload->>'seo_description';
    end if;
  end if;
  return new;
end $$;
create trigger nrcs_story_public_fields before insert or update on public.stories
for each row execute function public.nrcs_story_public_fields();
create function public.nrcs_daily_public_fields() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.nrcs_edition_id is not null then new.mux_upload_id:=null; end if;
  return new;
end $$;
create trigger nrcs_daily_public_fields before insert or update on public.dailys
for each row execute function public.nrcs_daily_public_fields();
notify pgrst,'reload schema';
commit;
