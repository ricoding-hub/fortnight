-- Fortnight — Gamification (XP, level, streak)
-- Tracks per-user experience points and activity streak.
-- RLS mirrors the pattern from 001_initial.sql (user owns their own row).

create table if not exists public.user_gamification (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  xp                 integer default 0   not null check (xp >= 0),
  level              integer default 1   not null check (level >= 1),
  streak_days        integer default 0   not null check (streak_days >= 0),
  last_activity_date date,
  updated_at         timestamptz default now() not null
);

alter table public.user_gamification enable row level security;

create policy "own gamification"
  on public.user_gamification
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- accounts: days-of-grace billing mode (e.g. Plata Card: 60d)
-- When set, payment due = last cut date + payment_grace_days.
-- Overrides payment_due_day for badge/alert calculations.
-- ============================================================
alter table public.accounts
  add column if not exists payment_grace_days int
    check (payment_grace_days between 1 and 365);

-- ============================================================
-- user_config: global email notification opt-out
-- ============================================================
alter table public.user_config
  add column if not exists notif_email boolean default true not null;

update public.user_config set notif_email = true where notif_email is null;

-- ============================================================
-- notifications: in-app inbox + email deduplication
-- ============================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null
                check (type in ('payment_due','payday','goal','mission')),
  title       text not null,
  body        text not null,
  read        boolean default false not null,
  account_id  uuid references public.accounts(id) on delete set null,
  dedup_key   text not null,
  email_sent  boolean default false not null,
  created_at  timestamptz default now() not null,
  unique(user_id, dedup_key)
);

alter table public.notifications enable row level security;

create policy "own notifications"
  on public.notifications
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_notifications_user_read
  on public.notifications(user_id, read);

grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- ============================================================
-- pg_cron: run send-payment-alerts daily at 15:00 UTC
-- REQUIRES pg_cron + pg_net extensions enabled in Supabase dashboard.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before uncommenting.
-- Alternatively configure a schedule from the Supabase dashboard UI:
--   Edge Functions → send-payment-alerts → Schedule → 0 15 * * *
-- ============================================================
-- select cron.schedule(
--   'send-payment-alerts',
--   '0 15 * * *',
--   $$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-payment-alerts',
--       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
--       body    := '{}'::jsonb
--     );
--   $$
-- );
