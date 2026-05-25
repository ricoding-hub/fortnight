-- Fortnight — Account ordering + bank logo support
--
-- 1. `sort_order` — user-controlled display order within Cuentas. Nullable
--    by design: rows without a value (e.g. accounts upserted by the Syncfy
--    sync endpoint, which doesn't set the column) sort after rows with a
--    value via `nulls last` in the client query, so they land at the end
--    in natural creation order.
-- 2. `logo_domain` — when set, AccountCard renders the bank's favicon from
--    Google's icon service instead of the avatar initials.

alter table public.accounts
  add column if not exists sort_order numeric,
  add column if not exists logo_domain text;

-- Backfill existing rows from creation order so the initial display matches
-- the prior chronological behavior. Idempotent: only fills nulls.
update public.accounts
  set sort_order = extract(epoch from created_at)
  where sort_order is null;

create index if not exists idx_accounts_user_sort
  on public.accounts(user_id, sort_order);
