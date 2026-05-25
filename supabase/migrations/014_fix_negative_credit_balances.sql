-- Fortnight — Fix: existing synced credit accounts with negative balance
--
-- Cause: api/_lib/sync.ts reconcileBalance compared Syncfy's credit
-- balance (Santander reports debt as a negative number) against our
-- positive convention without normalization. The drift was inserted as
-- a negative adjustment, then the update_account_balance trigger turned
-- the account balance negative.
--
-- Fix: flip the sign of the bad adjustment rows and recompute the
-- affected accounts' balance from the corrected transaction sum.
-- Future syncs are protected by the abs() now applied in
-- reconcileBalance, so this is a one-time data heal.

update public.transactions t
  set amount = -t.amount
  from public.accounts a
  where t.account_id = a.id
    and t.type = 'adjustment'
    and t.source = 'syncfy'
    and t.amount < 0
    and a.type = 'credit'
    and a.balance < 0;

-- update_account_balance trigger only fires on INSERT/DELETE, so the
-- UPDATE above doesn't re-derive balance. Recompute manually from the
-- (now corrected) transaction history.
update public.accounts a
  set balance = coalesce(
    (select sum(amount) from public.transactions where account_id = a.id),
    0
  ),
  updated_at = now()
  where a.source = 'syncfy'
    and a.type = 'credit'
    and a.balance < 0;
