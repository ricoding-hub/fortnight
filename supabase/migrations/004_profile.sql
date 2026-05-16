-- Fortnight — Profile (pay cycle + notification + Richeto prefs)
--
-- Adds payday-detection and notification columns to the existing user_config
-- table. The handoff README names this surface "profiles" but Fortnight already
-- has a one-row-per-user user_config — we extend it rather than fork a parallel
-- table. RLS is already enabled and "own config" already grants read/write to
-- a user's own row, so no new policy is needed.
--
-- Run this in the Supabase SQL Editor.

alter table public.user_config
  add column if not exists pay_freq text
    check (pay_freq in ('semanal','catorcenal','quincenal','mensual'))
    default 'catorcenal',
  add column if not exists pay_amount numeric(12,2) default 0,
  add column if not exists pay_reference date,
  add column if not exists notif_payday boolean default true,
  add column if not exists notif_due_card boolean default true,
  add column if not exists notif_mission boolean default false,
  add column if not exists notif_goal boolean default true,
  add column if not exists pet_floating boolean default true;

-- Backfill: existing rows get sensible defaults if NULL slipped through
-- (older Postgres versions ignore DEFAULT on add-column for existing rows in
-- some configurations).
update public.user_config
  set pay_freq      = coalesce(pay_freq,      'catorcenal'),
      pay_amount    = coalesce(pay_amount,    catorcena),  -- migrate legacy field
      pay_reference = coalesce(pay_reference, next_pay_date),
      notif_payday  = coalesce(notif_payday,  true),
      notif_due_card= coalesce(notif_due_card,true),
      notif_mission = coalesce(notif_mission, false),
      notif_goal    = coalesce(notif_goal,    true),
      pet_floating  = coalesce(pet_floating,  true);
