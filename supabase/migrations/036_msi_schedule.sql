-- v1.15: los meses sin intereses avanzan solos, y los movimientos se pueden editar.
--
-- Antes de correrla, revisa que no haya planes con datos imposibles (la
-- migración los corrige, pero conviene saber cuáles eran):
--
--   select id, name, months_total, months_paid
--     from public.installments
--    where months_total < 1 or months_total > 120 or months_paid < 0 or months_paid > months_total;
--
-- 1) Marcas por mes. Cada mensualidad tiene fecha (corte y fecha de pago de la
--    tarjeta) y se da por pagada sola cuando pasa su fecha límite. `month_status`
--    guarda sólo las excepciones que marca el usuario:
--      {"4": {"s": "paid", "at": "2026-10-12"}}   -- la pagó antes
--      {"5": {"s": "unpaid", "at": "2026-11-06"}} -- no la pagó
--    `months_paid` y `status` se siguen escribiendo como copia para versiones
--    viejas de la app que aún estén en caché.
--
-- 2) `billing_offset`: promociones de «empieza a pagar en N meses».
--
-- 3) El saldo también se recalcula al EDITAR un movimiento (monto o cuenta).
--    Hasta hoy el trigger sólo atendía INSERT y DELETE, y por eso editar
--    significaba borrar y volver a crear. Cambiar categoría, nota o fecha no
--    dispara nada: no mueve saldos ni da XP.
--    Ojo para el futuro: una migración que corrija `amount` con UPDATE ya NO
--    debe recalcular saldos a mano; el trigger lo hace.
--
-- 4) Guarda: un movimiento sólo puede apuntar a una cuenta del mismo usuario.
--    El trigger de saldo es SECURITY DEFINER y nunca lo verificaba; con UPDATE
--    el hueco sería mayor.

alter table public.installments
  add column if not exists month_status jsonb not null default '{}'::jsonb,
  add column if not exists billing_offset smallint not null default 0;

update public.installments set months_total = 1 where months_total < 1;
update public.installments set months_total = 120 where months_total > 120;
update public.installments
   set months_paid = least(greatest(months_paid, 0), months_total)
 where months_paid < 0 or months_paid > months_total;

alter table public.installments drop constraint if exists installments_months_chk;
alter table public.installments add constraint installments_months_chk
  check (months_total between 1 and 120 and months_paid between 0 and months_total);

alter table public.installments drop constraint if exists installments_offset_chk;
alter table public.installments add constraint installments_offset_chk
  check (billing_offset between 0 and 12);

alter table public.installments drop constraint if exists installments_month_status_chk;
alter table public.installments add constraint installments_month_status_chk
  check (jsonb_typeof(month_status) = 'object');

create or replace function public.update_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP in ('UPDATE', 'DELETE') then
    update public.accounts
       set balance = balance - OLD.amount,
           updated_at = now()
     where id = OLD.account_id;
  end if;
  if TG_OP in ('UPDATE', 'INSERT') then
    update public.accounts
       set balance = balance + NEW.amount,
           updated_at = now()
     where id = NEW.account_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_update_balance on public.transactions;
create trigger trg_update_balance
  after insert or delete or update of amount, account_id on public.transactions
  for each row execute function public.update_account_balance();

create or replace function public.transactions_own_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.accounts
     where id = NEW.account_id and user_id = NEW.user_id
  ) then
    raise exception 'account_not_owned' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_transactions_own_account on public.transactions;
create trigger trg_transactions_own_account
  before insert or update of account_id, user_id on public.transactions
  for each row execute function public.transactions_own_account();

notify pgrst, 'reload schema';
