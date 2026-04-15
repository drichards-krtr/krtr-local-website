begin;

-- Public site content: readable by anon/authenticated clients, writable by admins only.
alter table if exists public.footer_settings enable row level security;

drop policy if exists "Footer settings public read" on public.footer_settings;
create policy "Footer settings public read"
on public.footer_settings for select
using (true);

drop policy if exists "Footer settings admin full" on public.footer_settings;
create policy "Footer settings admin full"
on public.footer_settings for all
using (public.is_admin())
with check (public.is_admin());

alter table if exists public.social_links enable row level security;

drop policy if exists "Social links public read" on public.social_links;
create policy "Social links public read"
on public.social_links for select
using (true);

drop policy if exists "Social links admin full" on public.social_links;
create policy "Social links admin full"
on public.social_links for all
using (public.is_admin())
with check (public.is_admin());

-- Operational tables: API routes use service-role access, so public clients should not see these.
alter table if exists public.stream_config enable row level security;

drop policy if exists "Stream config admin full" on public.stream_config;
create policy "Stream config admin full"
on public.stream_config for all
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if to_regclass('public.analytics_sessions') is not null then
    execute 'alter table public.analytics_sessions enable row level security';

    execute 'drop policy if exists "Analytics sessions admin full" on public.analytics_sessions';
    execute $policy$
      create policy "Analytics sessions admin full"
      on public.analytics_sessions for all
      using (public.is_admin())
      with check (public.is_admin())
    $policy$;
  end if;
end
$$;

-- Search path hardening for linted functions.
do $$
begin
  if to_regprocedure('public.lock_nomination_category()') is not null then
    execute 'alter function public.lock_nomination_category() set search_path = public';
  end if;

  if to_regprocedure('public.prevent_nomination_overlap()') is not null then
    execute 'alter function public.prevent_nomination_overlap() set search_path = public';
  end if;

  if to_regprocedure('public.set_footer_settings_updated_at()') is not null then
    execute 'alter function public.set_footer_settings_updated_at() set search_path = public';
  end if;

  if to_regprocedure('public.set_social_links_updated_at()') is not null then
    execute 'alter function public.set_social_links_updated_at() set search_path = public';
  end if;

  if to_regprocedure('public.cleanup_old_alerts()') is not null then
    execute 'alter function public.cleanup_old_alerts() set search_path = public';
  end if;

  if to_regprocedure('public.cleanup_expired_logos()') is not null then
    execute 'alter function public.cleanup_expired_logos() set search_path = public';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'alter function public.set_updated_at() set search_path = public';
  end if;

  if to_regprocedure('public.set_created_by()') is not null then
    execute 'alter function public.set_created_by() set search_path = public';
  end if;
end
$$;

commit;
