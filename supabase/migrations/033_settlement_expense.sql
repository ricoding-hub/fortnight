-- Saldar un gasto compartido por separado.
--
-- Una liquidación no sabía a qué gasto correspondía: sólo movía el saldo entre
-- dos personas. Eso basta para "liquidar todo", pero no para saldar un gasto
-- concreto — tras pagar tu parte de la cena, la fila de la cena seguía diciendo
-- "Debes $85", porque nada la unía al pago.
--
-- `expense_id` es opcional: las liquidaciones generales siguen sin él. Si el
-- gasto se borra, la liquidación se conserva (el dinero sí se movió) y sólo
-- pierde el vínculo.
--
-- No toca las políticas RLS: la tabla ya se filtra por pertenencia al grupo, y
-- una columna nueva hereda esa protección.
alter table public.split_settlements
  add column if not exists expense_id uuid
    references public.split_expenses(id) on delete set null;

create index if not exists split_settlements_expense_idx
  on public.split_settlements (expense_id)
  where expense_id is not null;

notify pgrst, 'reload schema';
