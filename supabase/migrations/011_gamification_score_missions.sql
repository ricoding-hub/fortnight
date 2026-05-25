-- Fortnight — Gamification grants + score history + primary goal + missions
--
-- Combines two gaps into a single migration:
--
--   1. Gamification fix: migration 007 created user_gamification with RLS but
--      never granted table privileges, so PostgREST returned 403 on every
--      client-side SELECT/UPSERT. The trigger still ran server-side but realtime
--      never broadcast the updates because the table was not published.
--
--   2. Real score history, primary goal flag, and persistent weekly missions:
--      replaces the synthetic sparkline with a daily snapshot table, lets the
--      user mark one goal as principal, and persists mission completions so XP
--      is awarded exactly once per week per mission.

-- ============================================================
-- 1. user_gamification — grants + realtime
-- ============================================================
grant select, insert, update, delete on public.user_gamification to authenticated;
grant select, insert, update, delete on public.user_gamification to service_role;

do $$
begin
  alter publication supabase_realtime add table public.user_gamification;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ============================================================
-- 2. score_history — one row per (user, day). Sparkline reads last 30.
-- ============================================================
create table if not exists public.score_history (
  user_id          uuid         not null references auth.users(id) on delete cascade,
  day              date         not null,
  score            numeric(4,2) not null check (score between 0 and 10),
  utilization      numeric(5,4),
  liquidity        numeric(6,4),
  savings_rate     numeric(5,4),
  streak_days      int,
  budget_adherence numeric(5,4),
  recorded_at      timestamptz  default now() not null,
  primary key (user_id, day)
);

alter table public.score_history enable row level security;

create policy "own score history"
  on public.score_history
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.score_history to authenticated;
grant select, insert, update, delete on public.score_history to service_role;

create index if not exists idx_score_history_user_day
  on public.score_history(user_id, day desc);

-- ============================================================
-- 3. goals.is_primary — exactly one primary per user (partial unique index)
-- ============================================================
alter table public.goals
  add column if not exists is_primary boolean default false not null;

create unique index if not exists ux_goals_user_primary
  on public.goals(user_id) where is_primary;

-- ============================================================
-- 4. mission_completions — one row per (user, mission_id, cycle_week)
-- ============================================================
create table if not exists public.mission_completions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  mission_id text        not null,
  cycle_week text        not null,   -- 'YYYY-Www', ISO week
  reward_xp  int         not null check (reward_xp >= 0),
  claimed_at timestamptz default now() not null,
  unique (user_id, mission_id, cycle_week)
);

alter table public.mission_completions enable row level security;

create policy "own mission completions"
  on public.mission_completions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.mission_completions to authenticated;
grant select, insert, update, delete on public.mission_completions to service_role;

create index if not exists idx_mission_completions_user_week
  on public.mission_completions(user_id, cycle_week);

-- ============================================================
-- 5. Realtime publications (idempotent DO blocks)
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.score_history;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.mission_completions;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.goals;
exception when duplicate_object then null; when undefined_object then null;
end $$;
