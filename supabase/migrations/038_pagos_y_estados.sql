-- v1.17: pagar la tarjeta como lo que es, y el estado de cuenta del banco.
--
-- 1) Pago de tarjeta = transferencia. Hasta hoy la única forma de bajar la deuda
--    de una tarjeta era un «Ingreso» con categoría Salario/Vales/Extra, que no
--    sacaba el dinero de ninguna cuenta y contaba como ingreso. Ahora un pago son
--    dos renglones `type = 'transfer'` con el mismo `transfer_id`: la tarjeta
--    (−X, baja la deuda) y la cuenta de la que salió (−X). No son ingreso ni
--    gasto; el trigger de saldo los procesa como a cualquier movimiento.
--
-- 2) card_statements: la cifra del estado de cuenta del banco para un corte
--    («pago para no generar intereses» y mínimo). Si existe, manda sobre el
--    cálculo de la app.
--
-- Se puede correr más de una vez. No depende de la 036.

alter table public.transactions add column if not exists transfer_id uuid;

create index if not exists idx_transactions_transfer
  on public.transactions(transfer_id) where transfer_id is not null;
create index if not exists idx_transactions_account_date
  on public.transactions(account_id, date);

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('transaction','adjustment','sync','installment','transfer'));

alter table public.transactions drop constraint if exists transactions_transfer_chk;
alter table public.transactions add constraint transactions_transfer_chk
  check ((type = 'transfer') = (transfer_id is not null));

create table if not exists public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  cut_date date not null,
  no_interest_amount numeric(14,2) check (no_interest_amount is null or no_interest_amount >= 0),
  min_amount numeric(14,2) check (min_amount is null or min_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, cut_date)
);

alter table public.card_statements enable row level security;
drop policy if exists "own card statements" on public.card_statements;
create policy "own card statements" on public.card_statements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.card_statements to authenticated;

-- La cuenta tiene que ser una tarjeta de crédito del mismo usuario.
create or replace function public.card_statements_own_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.accounts
     where id = NEW.account_id and user_id = NEW.user_id and type = 'credit'
  ) then
    raise exception 'account_not_owned' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_card_statements_own_account on public.card_statements;
create trigger trg_card_statements_own_account
  before insert or update of account_id, user_id on public.card_statements
  for each row execute function public.card_statements_own_account();

do $$
begin
  alter publication supabase_realtime add table public.card_statements;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
