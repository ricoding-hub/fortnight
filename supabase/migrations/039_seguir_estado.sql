-- 039 · El estado de cuenta calculado es opcional, por tarjeta.
--
-- Hasta v1.18 la app calculaba el estado de cuenta de toda tarjeta con día de
-- corte, a partir del saldo y de los movimientos registrados. Quien no registra
-- todo veía estados que no eran, avisos con montos equivocados y mensualidades
-- «vencidas» que sí pagó. Ahora cada tarjeta empieza en modo ligero (saldos y
-- fechas) y el estado de cuenta se enciende a mano, tarjeta por tarjeta.
--
-- Repetible. Sin backfill: todas las tarjetas quedan en ligero.

alter table public.accounts
  add column if not exists track_statement boolean not null default false;

comment on column public.accounts.track_statement is
  'Tarjetas de crédito: la app calcula su estado de cuenta (pago para no generar intereses, mensualidades MSI cubiertas por pagos). Apagado = modo ligero, sólo saldos y fechas.';

notify pgrst, 'reload schema';
