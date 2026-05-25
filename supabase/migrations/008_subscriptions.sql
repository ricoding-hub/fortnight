-- Fortnight — Subscriptions
-- Tracks recurring charges: streaming services, gym, SaaS, etc.

create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  uuid references public.accounts(id) on delete set null,
  name        text not null,
  amount      numeric(12,2) not null check (amount > 0),
  frequency   text not null check (frequency in ('mensual','trimestral','anual')),
  charge_day  int  not null check (charge_day between 1 and 31),
  category_id uuid references public.categories(id) on delete set null,
  brand_id    text,
  color       text,
  notes       text,
  active      boolean default true not null,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

alter table public.subscriptions enable row level security;

create policy "own subscriptions"
  on public.subscriptions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_subscriptions_user
  on public.subscriptions(user_id, active);

grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;
