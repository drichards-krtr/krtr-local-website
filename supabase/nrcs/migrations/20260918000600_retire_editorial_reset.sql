begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

-- Retire the temporary capability; never delete imported editorial data.
drop function if exists public.nrcs_temporary_editorial_reset(text);
notify pgrst,'reload schema';
commit;
