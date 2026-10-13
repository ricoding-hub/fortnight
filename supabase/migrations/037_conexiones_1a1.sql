-- v1.16: una conexión 1:1 no es un grupo, tampoco en las notificaciones.
--
-- Una conexión se guarda como un grupo de dos personas, y el nombre del grupo
-- y las etiquetas de los miembros los pone quien la crea, desde SU lado: Toño
-- crea la conexión, la llama «Richy» y su propia fila queda como «Yo». Las
-- funciones de abajo usaban esas etiquetas tal cual, así que Richy recibía
-- notificaciones tituladas «Richy» y veía pagos como «Yo → Richy».
--
-- Cambios (los grupos de 3 o más quedan exactamente igual):
--   · notify_split_activity: en una conexión el título es el nombre de quien
--     hizo el cambio (la otra persona), y «se unió al grupo» pasa a «se conectó
--     contigo».
--   · log_split_settlement_activity: los nombres de un pago salen del perfil
--     cuando el miembro tiene cuenta, no de la etiqueta del creador.
--
-- Copia de 023 y 022 con sólo esas líneas cambiadas. Se puede correr más de
-- una vez (create or replace). Los triggers ya apuntan a estas funciones.

-- Nombre visible de un miembro: el de su perfil si tiene cuenta; si no, su
-- etiqueta local.
create or replace function public.split_member_display_name(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(p.display_name), ''), m.name)
    from public.split_members m
    left join public.profiles p on p.id = m.member_user_id
   where m.id = p_member_id;
$$;

-- Sólo la usan los triggers (que corren como dueño). Sin esto, cualquiera con
-- sesión podría pedir el nombre de un miembro ajeno por RPC.
revoke execute on function public.split_member_display_name(uuid) from public, anon, authenticated;

create or replace function public.notify_split_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_activos    int;
  v_conexion   boolean;
  v_titulo     text;
  v_body       text;
begin
  if NEW.verb not in ('expense_added','expense_edited','expense_deleted',
                      'settlement_added','member_added','member_linked','member_left') then
    return NEW;
  end if;

  select name into v_group_name from public.split_groups where id = NEW.group_id;
  select count(*) into v_activos
    from public.split_members
   where group_id = NEW.group_id and left_at is null;
  v_conexion := v_activos = 2;

  -- En una conexión, quien recibe la notificación es la otra persona: el
  -- título es quien hizo el cambio. El nombre del grupo lo eligió el creador
  -- desde su lado y para el otro es su propio nombre.
  v_titulo := case
    when v_conexion then coalesce(nullif(trim(NEW.actor_name), ''), 'Tu conexión')
    else coalesce(v_group_name, 'Grupo')
  end;

  v_body := case NEW.verb
    when 'expense_added'    then NEW.actor_name || ' añadió "' || coalesce(NEW.subject,'') || '"'
    when 'expense_edited'   then NEW.actor_name || ' editó "' || coalesce(NEW.subject,'') || '"'
    when 'expense_deleted'  then NEW.actor_name || ' eliminó "' || coalesce(NEW.subject,'') || '"'
    when 'settlement_added' then NEW.actor_name || ' registró un pago: ' || coalesce(NEW.subject,'')
    when 'member_added'     then NEW.actor_name || ' agregó a ' || coalesce(NEW.subject,'alguien')
    when 'member_linked'    then
      case when v_conexion then NEW.actor_name || ' se conectó contigo'
           else NEW.actor_name || ' se unió al grupo' end
    when 'member_left'      then
      case when v_conexion then coalesce(NEW.subject,'Alguien') || ' salió de la conexión'
           else coalesce(NEW.subject,'Alguien') || ' salió del grupo' end
  end;
  if NEW.amount is not null then
    v_body := v_body || ' · $' || to_char(NEW.amount, 'FM999,999,990.00');
  end if;

  insert into public.notifications (user_id, type, title, body, dedup_key, link)
  select m.member_user_id, 'split', v_titulo, v_body,
         'split:' || NEW.id, '/cuentas/prestamos/' || NEW.group_id
  from public.split_members m
  where m.group_id = NEW.group_id
    and m.member_user_id is not null
    and m.left_at is null
    and (NEW.actor_user_id is null or m.member_user_id <> NEW.actor_user_id)
  on conflict (user_id, dedup_key) do nothing;

  return NEW;
end;
$$;

create or replace function public.log_split_settlement_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to   text;
begin
  -- Nombres visibles, no las etiquetas del creador («Yo → Richy»).
  v_from := public.split_member_display_name(NEW.from_member_id);
  v_to   := public.split_member_display_name(NEW.to_member_id);
  insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
  values (NEW.group_id, auth.uid(), public.split_actor_name(), 'settlement_added',
          coalesce(v_from, '—') || ' → ' || coalesce(v_to, '—'), NEW.amount,
          jsonb_build_object('from_member_id', NEW.from_member_id, 'to_member_id', NEW.to_member_id));
  return NEW;
end;
$$;

notify pgrst, 'reload schema';
