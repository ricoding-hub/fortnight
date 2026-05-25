-- Fortnight — Fix: gamification XP/streak not updating in the UI
--
-- Migration 007 created public.user_gamification with RLS + policy, but
-- never granted base table privileges to authenticated/service_role.
-- PostgREST therefore returned 403 on every client-side SELECT / UPSERT
-- (`seed`, `addXP`), so the row was never read and never written from the
-- browser. The SECURITY DEFINER trigger (`award_xp_on_transaction`) was
-- still updating the row server-side, but realtime never propagated those
-- updates because the table was not in the supabase_realtime publication.
--
-- This migration fixes both gaps idempotently.

grant select, insert, update, delete on public.user_gamification to authenticated;
grant select, insert, update, delete on public.user_gamification to service_role;

-- Add the table to the realtime publication so the trigger's updates
-- broadcast to subscribed clients. Wrapped in DO so re-runs are safe.
do $$
begin
  alter publication supabase_realtime add table public.user_gamification;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication itself may not exist on self-hosted
end $$;
