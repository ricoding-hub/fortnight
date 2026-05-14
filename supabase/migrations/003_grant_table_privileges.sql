-- Fortnight — Fix: 403 "permission denied for table" on every REST query
--
-- RLS controls which ROWS a role can see, but the role still needs base
-- table privileges to access the table at all. The initial migration enabled
-- RLS and added policies but never granted SELECT/INSERT/UPDATE/DELETE to the
-- `authenticated` role, so PostgREST returned 42501 -> HTTP 403 for everything.
--
-- The RLS policies (auth.uid() = user_id) still scope each user to their own
-- rows; these grants only open the door for an authenticated user to reach it.
--
-- Run this in the Supabase SQL Editor.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.categories,
  public.accounts,
  public.transactions,
  public.loans,
  public.user_config
to authenticated;
