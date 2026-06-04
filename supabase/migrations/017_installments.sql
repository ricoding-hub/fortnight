-- Meses sin intereses (MSI) — installment tracker.
-- Stores fixed monthly commitments to be paid over N months.

create table public.installments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  account_id     uuid references public.accounts(id) on delete set null,
  name           text not null,
  total_amount   numeric not null,
  monthly_amount numeric not null,
  months_total   int not null,
  months_paid    int not null default 0,
  start_date     date not null default current_date,
  status         text not null default 'active' check (status in ('active','paid')),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table public.installments enable row level security;

create policy "own installments"
  on public.installments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.installments to authenticated;

alter publication supabase_realtime add table public.installments;
