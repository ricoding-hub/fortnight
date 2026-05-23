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
