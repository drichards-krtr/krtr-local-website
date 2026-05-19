begin;

-- Make public schema objects reachable through Supabase Data API roles.
-- Row level security policies remain responsible for deciding which rows and
-- operations anon/authenticated users can actually access.
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
grant all privileges on tables to anon, authenticated, service_role;

alter default privileges in schema public
grant all privileges on sequences to anon, authenticated, service_role;

commit;
