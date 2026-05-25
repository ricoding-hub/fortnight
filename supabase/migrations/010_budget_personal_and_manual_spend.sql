-- 010_budget_personal_and_manual_spend.sql
--
-- 1. Add a "personal" preset snapshot to budget_plans so user customisations
--    survive switching back to a named preset (50/30/20, etc).
-- 2. Per-item manual real spend overrides for the current cycle, used when
--    the user couldn't log transactions and wants to enter the real amount.

-- 1) Personal preset snapshot on budget_plans
alter table public.budget_plans
  add column if not exists personal_name text default 'Personalizado',
  add column if not exists personal_snapshot jsonb default null;

-- 2) Manual real-spend overrides per item per cycle
create table if not exists public.budget_item_manual_spend (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      uuid not null references public.budget_items(id) on delete cascade,
  cycle_month  text not null,
  amount       numeric not null check (amount >= 0),
  updated_at   timestamptz default now() not null,
  unique(user_id, item_id, cycle_month)
);

alter table public.budget_item_manual_spend enable row level security;

create policy "own manual spend"
  on public.budget_item_manual_spend
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_manual_spend_user_cycle
  on public.budget_item_manual_spend (user_id, cycle_month);

grant select, insert, update, delete
  on public.budget_item_manual_spend
  to authenticated, service_role;
