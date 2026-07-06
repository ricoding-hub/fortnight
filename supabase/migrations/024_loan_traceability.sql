-- Loan traceability: every loan action (create, edit, abono, settle,
-- reopen, delete) now writes to split_activity via DB triggers, matching
-- the split tables — history that clients cannot skip. Only loans stamped
-- with a group_id log activity; a backfill stamps orphans into their
-- direct 2-person groups first.
--
-- Loan verbs never notify (loans are private to their owner and excluded
-- from connected groups' shared math) — notify_split_activity is untouched.
--
-- Idempotent and safely re-runnable, like 022/023.

-- ============================================================
-- 1. Backfill: stamp orphan loans into their direct group
--    (2-person group of the same owner whose non-me member name
--    matches the loan contact name, and no external linked member)
-- ============================================================

update public.loans l
set group_id = g.id
from public.split_groups g
join public.split_members m
  on m.group_id = g.id and m.is_me = false
where l.group_id is null
  and g.user_id = l.user_id
  and lower(trim(m.name)) = lower(trim(l.name))
  and (select count(*) from public.split_members mm where mm.group_id = g.id) = 2
  and not exists (
    select 1 from public.split_members mx
    where mx.group_id = g.id and mx.is_me = false and mx.member_user_id is not null
  );

-- ============================================================
-- 2. Extend split_activity verbs with loan events
-- ============================================================

alter table public.split_activity drop constraint if exists split_activity_verb_check;
alter table public.split_activity add constraint split_activity_verb_check
  check (verb in (
    'group_created','group_renamed','member_added','member_linked','member_left',
    'expense_added','expense_edited','expense_deleted','settlement_added','invite_sent',
    'loan_added','loan_edited','loan_payment','loan_settled','loan_reopened','loan_deleted'
  ));

-- ============================================================
-- 3. Triggers on loans
-- ============================================================

create or replace function public.log_loan_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.group_id is not null then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
      values (NEW.group_id, auth.uid(), public.split_actor_name(), 'loan_added',
              NEW.name, NEW.amount,
              jsonb_build_object('loan_id', NEW.id, 'direction', NEW.direction));
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.group_id is null then return NEW; end if;
    if NEW.paid_at is not null and OLD.paid_at is null then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
      values (NEW.group_id, auth.uid(), public.split_actor_name(), 'loan_settled',
              NEW.name, NEW.amount, jsonb_build_object('loan_id', NEW.id));
    elsif NEW.paid_at is null and OLD.paid_at is not null then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
      values (NEW.group_id, auth.uid(), public.split_actor_name(), 'loan_reopened',
              NEW.name, NEW.amount, jsonb_build_object('loan_id', NEW.id));
    elsif NEW.amount is distinct from OLD.amount
       or NEW.name is distinct from OLD.name
       or NEW.notes is distinct from OLD.notes
       or NEW.direction is distinct from OLD.direction then
      -- A group_id-only change (stamping) is not an event.
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
      values (NEW.group_id, auth.uid(), public.split_actor_name(), 'loan_edited',
              NEW.name, NEW.amount, jsonb_build_object('loan_id', NEW.id));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists tr_log_loan on public.loans;
create trigger tr_log_loan
  after insert or update on public.loans
  for each row execute function public.log_loan_activity();

create or replace function public.log_loan_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.group_id is not null then
    insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
    values (OLD.group_id, auth.uid(), public.split_actor_name(), 'loan_deleted',
            OLD.name, OLD.amount, jsonb_build_object('loan_id', OLD.id));
  end if;
  return OLD;
end;
$$;

drop trigger if exists tr_log_loan_delete on public.loans;
create trigger tr_log_loan_delete
  before delete on public.loans
  for each row execute function public.log_loan_delete();

-- ============================================================
-- 4. Triggers on loan_payments (abonos)
-- ============================================================

create or replace function public.log_loan_payment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans%rowtype;
begin
  if TG_OP = 'INSERT' then
    select * into v_loan from public.loans where id = NEW.loan_id;
    if found and v_loan.group_id is not null then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
      values (v_loan.group_id, auth.uid(), public.split_actor_name(), 'loan_payment',
              v_loan.name, NEW.amount, jsonb_build_object('loan_id', v_loan.id));
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    select * into v_loan from public.loans where id = OLD.loan_id;
    if found and v_loan.group_id is not null then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
      values (v_loan.group_id, auth.uid(), public.split_actor_name(), 'loan_payment',
              v_loan.name, OLD.amount,
              jsonb_build_object('loan_id', v_loan.id, 'removed', true));
    end if;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists tr_log_loan_payment on public.loan_payments;
create trigger tr_log_loan_payment
  after insert or delete on public.loan_payments
  for each row execute function public.log_loan_payment_activity();

-- ============================================================
-- Verification (run manually, read-only):
--   -- Orphan loans whose contact has a direct group: should be 0
--   select count(*) from public.loans l where l.group_id is null
--     and exists (select 1 from public.split_members m
--                 join public.split_groups g on g.id = m.group_id
--                 where g.user_id = l.user_id and m.is_me = false
--                   and lower(trim(m.name)) = lower(trim(l.name)));
--   -- New abono writes a loan_payment activity row:
--   --   insert a loan_payment, then select * from split_activity order by created_at desc limit 1;
-- ============================================================
