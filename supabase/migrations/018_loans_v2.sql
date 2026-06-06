-- Loans v2: bidirectional direction + partial payment tracking.
-- Backward-compatible: existing rows default to 'owed_to_me'.

alter table public.loans
  add column if not exists direction text not null default 'owed_to_me'
    check (direction in ('owed_to_me', 'i_owe'));

create table public.loan_payments (
  id         uuid primary key default gen_random_uuid(),
  loan_id    uuid not null references public.loans(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  note       text,
  created_at timestamptz not null default now()
);

alter table public.loan_payments enable row level security;

create policy "own loan_payments"
  on public.loan_payments for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.loan_payments to authenticated;

create index idx_loan_payments_loan_id on public.loan_payments(loan_id);
create index idx_loan_payments_user   on public.loan_payments(user_id);

alter publication supabase_realtime add table public.loan_payments;
