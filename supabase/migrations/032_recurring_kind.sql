-- Gastos fijos con fecha (renta, servicios, colegiaturas…).
--
-- No hace falta una tabla nueva: `subscriptions` ya guarda exactamente lo que
-- un gasto fijo necesita — nombre, monto, periodicidad, día de cobro, cuenta y
-- categoría. Lo único que distinguía a Netflix de la renta era la categoría y
-- cómo lo llama la interfaz. Duplicar el modelo habría significado duplicar
-- también el calendario, la proyección y el cálculo del disponible.
--
-- `kind` separa los dos para poder agruparlos y etiquetarlos distinto. Todo lo
-- que ya existe queda como suscripción, que es lo que era.
alter table public.subscriptions
  add column if not exists kind text not null default 'suscripcion';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_kind_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_kind_check check (kind in ('suscripcion', 'fijo'));
  end if;
end $$;

comment on column public.subscriptions.kind is
  'suscripcion = servicio contratado (Netflix, Spotify). fijo = gasto fijo con fecha (renta, luz, colegiatura).';

create index if not exists subscriptions_user_kind_idx
  on public.subscriptions (user_id, kind) where active;

notify pgrst, 'reload schema';
