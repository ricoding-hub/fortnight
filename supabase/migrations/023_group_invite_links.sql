-- Group invite links (Splitwise model): every group carries a shareable
-- invite_code; whoever opens /join/{code} claims an existing unlinked
-- member slot or joins as a new person. The code is readable by group
-- members only (existing RLS) — any member can share the link. Non-members
-- resolve the code exclusively through the service-role /api/split/join.
--
-- Idempotent and safely re-runnable, like 022.

-- ============================================================
-- 1. invite_code on split_groups
-- ============================================================

alter table public.split_groups
  add column if not exists invite_code uuid not null default gen_random_uuid();

create unique index if not exists uq_split_groups_invite_code
  on public.split_groups(invite_code);

-- ============================================================
-- 2. Notify on member_added (direct add of a linked recent contact)
-- ============================================================

create or replace function public.notify_split_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_body       text;
begin
  if NEW.verb not in ('expense_added','expense_edited','expense_deleted',
                      'settlement_added','member_added','member_linked','member_left') then
    return NEW;
  end if;

  select name into v_group_name from public.split_groups where id = NEW.group_id;

  v_body := case NEW.verb
    when 'expense_added'    then NEW.actor_name || ' añadió "' || coalesce(NEW.subject,'') || '"'
    when 'expense_edited'   then NEW.actor_name || ' editó "' || coalesce(NEW.subject,'') || '"'
    when 'expense_deleted'  then NEW.actor_name || ' eliminó "' || coalesce(NEW.subject,'') || '"'
    when 'settlement_added' then NEW.actor_name || ' registró un pago: ' || coalesce(NEW.subject,'')
    when 'member_added'     then NEW.actor_name || ' agregó a ' || coalesce(NEW.subject,'alguien')
    when 'member_linked'    then NEW.actor_name || ' se unió al grupo'
    when 'member_left'      then coalesce(NEW.subject,'Alguien') || ' salió del grupo'
  end;
  if NEW.amount is not null then
    v_body := v_body || ' · $' || to_char(NEW.amount, 'FM999,999,990.00');
  end if;

  insert into public.notifications (user_id, type, title, body, dedup_key, link)
  select m.member_user_id, 'split', coalesce(v_group_name, 'Grupo'), v_body,
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

-- Trigger tr_notify_split_activity (from 022) already points at this
-- function; create-or-replace above is enough.

-- ============================================================
-- Verification (run manually, read-only):
--   select count(*) from public.split_groups where invite_code is null;  -- 0
-- ============================================================
