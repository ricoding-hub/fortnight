-- Fortnight — Plan module (budget plan + buckets + items + goals)
--
-- Adds the four tables that power the Plan screen (Presupuesto / Objetivos /
-- Proyección). All tables follow the same RLS pattern as 001_initial.sql:
-- each authenticated user reads/writes only their own rows, scoped either
-- directly via `user_id` or transitively via plan_id → user_id / bucket_id →
-- plan_id → user_id.
--
-- Run this in the Supabase SQL Editor.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  preset text default '50-30-20',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.budget_buckets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.budget_plans(id) on delete cascade not null,
  slug text not null,                  -- 'needs' | 'wants' | 'save'
  name text not null,
  pct numeric(5,2) not null,
  color text not null,
  soft_color text not null,
  sort_order int default 0
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid references public.budget_buckets(id) on delete cascade not null,
  slug text not null,
  name text not null,
  pct numeric(5,2) not null,
  category_id uuid references public.categories(id) on delete set null,
  icon text,
  sort_order int default 0
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text,
  color text,
  target numeric(12,2) not null,
  saved numeric(12,2) default 0 not null,
  monthly numeric(12,2) not null,
  deadline date,
  is_debt boolean default false,
  started_at date default current_date,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_budget_plans_user on public.budget_plans(user_id);
create index if not exists idx_budget_buckets_plan on public.budget_buckets(plan_id);
create index if not exists idx_budget_items_bucket on public.budget_items(bucket_id);
create index if not exists idx_budget_items_category on public.budget_items(category_id);
create index if not exists idx_goals_user on public.goals(user_id);

-- ============================================================
-- GRANTS
-- ============================================================

grant select, insert, update, delete on
  public.budget_plans,
  public.budget_buckets,
  public.budget_items,
  public.goals
to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.budget_plans   enable row level security;
alter table public.budget_buckets enable row level security;
alter table public.budget_items   enable row level security;
alter table public.goals          enable row level security;

create policy "own budget_plans" on public.budget_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Buckets and items don't have user_id directly — scope via plan ownership.
create policy "own budget_buckets" on public.budget_buckets
  for all using (
    exists (
      select 1 from public.budget_plans p
      where p.id = budget_buckets.plan_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.budget_plans p
      where p.id = budget_buckets.plan_id and p.user_id = auth.uid()
    )
  );

create policy "own budget_items" on public.budget_items
  for all using (
    exists (
      select 1 from public.budget_buckets b
      join public.budget_plans p on p.id = b.plan_id
      where b.id = budget_items.bucket_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.budget_buckets b
      join public.budget_plans p on p.id = b.plan_id
      where b.id = budget_items.bucket_id and p.user_id = auth.uid()
    )
  );

create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
