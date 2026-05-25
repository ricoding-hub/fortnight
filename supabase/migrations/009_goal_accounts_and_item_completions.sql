-- Fortnight — Meta↔Cuentas (M:N) + Estado de pago por ciclo

-- ============================================================
-- 1. goal_accounts: una meta puede estar respaldada por
--    múltiples cuentas (ej: Coche = Nu cajita + BBVA + CETES).
--    goal.saved se deriva: suma de balances enlazados
--    (o target - sum(balances) si is_debt).
-- ============================================================
create table if not exists public.goal_accounts (
  goal_id    uuid not null references public.goals(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (goal_id, account_id)
);

alter table public.goal_accounts enable row level security;

create policy "own goal_accounts"
  on public.goal_accounts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_goal_accounts_goal on public.goal_accounts(goal_id);
create index if not exists idx_goal_accounts_user on public.goal_accounts(user_id);

grant select, insert, update, delete on public.goal_accounts to authenticated;
grant select, insert, update, delete on public.goal_accounts to service_role;

-- ============================================================
-- 2. budget_item_completions: estado "pagado este ciclo" por
--    item del presupuesto. cycle_month = 'YYYY-MM'. Unique
--    por (user, item, ciclo) — toggle = insert / delete.
-- ============================================================
create table if not exists public.budget_item_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      uuid not null references public.budget_items(id) on delete cascade,
  cycle_month  text not null,
  completed_at timestamptz default now() not null,
  unique(user_id, item_id, cycle_month)
);

alter table public.budget_item_completions enable row level security;

create policy "own item completions"
  on public.budget_item_completions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_item_completions_user_cycle
  on public.budget_item_completions(user_id, cycle_month);

grant select, insert, update, delete on public.budget_item_completions to authenticated;
grant select, insert, update, delete on public.budget_item_completions to service_role;
