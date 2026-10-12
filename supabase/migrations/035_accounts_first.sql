-- Qué sección de cuentas va primero: débito o crédito.
--
-- Hasta ahora el orden estaba fijo (débito arriba). Quien vive de la tarjeta de
-- crédito quiere verla primero, y la preferencia tiene que viajar entre el
-- iPhone y la laptop, así que va en `user_config` y no en el navegador.
--
-- `null` significa «lo de siempre» (débito primero). Hereda la política RLS de
-- la tabla: cada quien sólo ve y cambia su propia fila.
alter table public.user_config
  add column if not exists accounts_first text;

alter table public.user_config
  drop constraint if exists user_config_accounts_first_chk;
alter table public.user_config
  add constraint user_config_accounts_first_chk
  check (accounts_first is null or accounts_first in ('debit', 'credit'));

notify pgrst, 'reload schema';
