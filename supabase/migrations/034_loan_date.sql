-- Fecha de un préstamo personal, distinta del día en que se registró.
--
-- Hasta ahora sólo se guardaba `created_at`, el momento en que se anotó. Pero
-- "le presté $500 el 29 de septiembre" y "lo anoté el 4 de octubre" son dos
-- datos: sin el primero, el préstamo aparecía fechado el día del registro y el
-- historial no cuadraba con lo que pasó de verdad.
--
-- `loan_date` es el día en que ocurrió el préstamo. Los existentes se rellenan
-- con el día de su registro, que es lo que se mostraba hasta hoy, así que nada
-- cambia de fecha. No toca las políticas RLS: la tabla ya se filtra por
-- usuario, y una columna nueva hereda esa protección.
alter table public.loans
  add column if not exists loan_date date;

update public.loans
   set loan_date = (created_at at time zone 'America/Mexico_City')::date
 where loan_date is null;

alter table public.loans
  alter column loan_date set default (now() at time zone 'America/Mexico_City')::date;

create index if not exists loans_user_loan_date_idx
  on public.loans (user_id, loan_date desc);

notify pgrst, 'reload schema';
