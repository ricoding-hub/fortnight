-- Fortnight — Real score history, primary goal flag, persistent missions
--
-- Replaces the synthetic sparkline with a daily score snapshot table, lets the
-- user mark one goal as "principal" (shown first across Plan tabs and used as
-- the "mes libre de deuda" anchor), and persists weekly mission completions so
-- XP can be awarded exactly once per cycle.

-- ============================================================
-- score_history: one row per (user, day). Sparkline reads last 30.
-- ============================================================
create table if not exists public.score_history (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  day              date        not null,
  score            numeric(4,2) not null check (score between 0 and 10),
  utilization      numeric(5,4),
  liquidity        numeric(6,4),
  savings_rate     numeric(5,4),
  streak_days      int,
  budget_adherence numeric(5,4),
  recorded_at      timestamptz default now() not null,
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
-- goals.is_primary — exactly one primary per user (partial unique idx)
-- ============================================================
alter table public.goals
  add column if not exists is_primary boolean default false not null;

create unique index if not exists ux_goals_user_primary
  on public.goals(user_id) where is_primary;

-- ============================================================
-- mission_completions — one row per (user, mission_id, cycle_week)
-- ============================================================
create table if not exists public.mission_completions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  mission_id  text not null,
  cycle_week  text not null,   -- 'YYYY-Www', ISO week
  reward_xp   int  not null check (reward_xp >= 0),
  claimed_at  timestamptz default now() not null,
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
-- Add the new tables (and goals for the is_primary updates) to the
-- supabase_realtime publication so UPDATEs broadcast to clients.
-- Wrapped in DO so re-runs are safe.
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
