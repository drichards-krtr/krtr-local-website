-- Run in the SALES project SQL editor AFTER creating Dan's Auth account.
-- Replace only the UUID below with Dan's verified Auth user UUID.
-- Never select the first signup or trust user-provided metadata for ownership.
begin;
do $$
declare owner_uuid uuid := '00000000-0000-0000-0000-000000000000';
begin
  if owner_uuid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace the placeholder with Dan''s verified Auth UUID first';
  end if;
  if not exists(select 1 from auth.users where id = owner_uuid) then
    raise exception 'The specified Auth user does not exist';
  end if;
  insert into public.sales_profiles(id, display_name, active) values(owner_uuid, 'Dan', true)
  on conflict(id) do update set display_name = 'Dan', active = true;
  insert into public.sales_owner(singleton, user_id) values(true, owner_uuid);
end $$;
commit;
