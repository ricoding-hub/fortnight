-- v1.7.0: cargar un plan a meses al saldo de la tarjeta.
--
-- Hasta ahora `installments` vivía aislada: ninguna de sus rutas tocaba
-- `accounts` ni `transactions`. Pero `getRevolvingBalance` (src/lib/debt.ts)
-- siempre dio por hecho que el capital MSI ya estaba DENTRO de
-- `accounts.balance` y lo restaba. El invariante se asumía sin que nada lo
-- estableciera: un plan de $2,976 podía convivir con un saldo de $0.
--
-- El vínculo se hace por el único camino que mueve saldos en este esquema: un
-- renglón en `transactions`, que dispara `trg_update_balance`.

-- El movimiento que representa el cargo del plan a la tarjeta. `set null` y no
-- `cascade`: si se borra el plan queremos decidir en la app si el cargo se va
-- con él (y el saldo baja) o se queda como historia.
alter table public.transactions
  add column if not exists installment_id uuid
    references public.installments(id) on delete set null;

create index if not exists idx_transactions_installment
  on public.transactions(installment_id)
  where installment_id is not null;

-- Tipo propio para el cargo. Las analíticas de gasto filtran por
-- type = 'transaction' (gasto mensual, tasa de ahorro, misiones), así que un
-- tipo aparte deja que la compra mueva el saldo sin inflar el gasto del mes:
-- lo que de verdad sale cada mes es la mensualidad, y esa ya la lleva
-- Proyección por otro lado. El trigger de saldo no filtra por tipo, así que
-- sigue disparando igual.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('transaction','adjustment','sync','installment'));
