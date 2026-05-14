-- Fortnight — Initial schema
-- Run this in Supabase SQL Editor or via supabase CLI

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  kind text check (kind in ('fixed', 'variable', 'income')) not null,
  icon text,
  color text,
  created_at timestamptz default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text check (type in ('debit', 'credit')) not null,
  balance numeric(12,2) default 0 not null,
  credit_limit numeric(12,2),
  cut_day int check (cut_day between 1 and 31),
  payment_due_day int check (payment_due_day between 1 and 31),
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references accounts(id) on delete cascade not null,
  amount numeric(12,2) not null,
  category_id uuid references categories(id) on delete set null,
  description text,
  date date not null default current_date,
  type text check (type in ('transaction', 'adjustment')) default 'transaction',
  created_at timestamptz default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric(12,2) not null,
  notes text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

create table if not exists user_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  catorcena numeric(10,2) default 0,
  vales numeric(10,2) default 0,
  fixed_monthly numeric(10,2) default 0,
  variable_monthly numeric(10,2) default 0,
  next_pay_date date,
  updated_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_accounts_user on accounts(user_id);
create index if not exists idx_transactions_user_date on transactions(user_id, date desc);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_categories_user on categories(user_id);
create index if not exists idx_loans_user_active on loans(user_id) where paid_at is null;

-- ============================================================
-- GRANTS
-- ============================================================
-- RLS scopes which rows a role sees, but the role still needs base table
-- privileges to reach the table at all. Without these, PostgREST returns 403.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  categories, accounts, transactions, loans, user_config
to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table categories enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table loans enable row level security;
alter table user_config enable row level security;

create policy "own categories" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own accounts" on accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own loans" on loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own config" on user_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS: auto-update account balance on transaction insert/delete
-- ============================================================

-- SECURITY DEFINER functions must pin search_path and schema-qualify tables,
-- otherwise they fail when invoked from a context without `public` on the path.
create or replace function update_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.accounts
      set balance = balance + NEW.amount,
          updated_at = now()
      where id = NEW.account_id;
  elsif (TG_OP = 'DELETE') then
    update public.accounts
      set balance = balance - OLD.amount,
          updated_at = now()
      where id = OLD.account_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_update_balance on transactions;
create trigger trg_update_balance
  after insert or delete on transactions
  for each row execute function update_account_balance();

-- ============================================================
-- TRIGGERS: seed default categories on user signup
-- ============================================================

create or replace function seed_user_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind) values
    (NEW.id, 'Renta', 'fixed'),
    (NEW.id, 'Servicios', 'fixed'),
    (NEW.id, 'Suscripciones', 'fixed'),
    (NEW.id, 'Comida', 'variable'),
    (NEW.id, 'Social', 'variable'),
    (NEW.id, 'Transporte', 'variable'),
    (NEW.id, 'Salud', 'variable'),
    (NEW.id, 'Otros', 'variable'),
    (NEW.id, 'Salario', 'income'),
    (NEW.id, 'Vales', 'income'),
    (NEW.id, 'Extra', 'income');

  insert into public.user_config (user_id) values (NEW.id);

  return NEW;
end;
$$;

drop trigger if exists trg_seed_user_data on auth.users;
create trigger trg_seed_user_data
  after insert on auth.users
  for each row execute function seed_user_data();
