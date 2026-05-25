-- Fortnight — Fix: 400 on every Syncfy account/transaction upsert
--
-- Root cause: ux_accounts_user_external and ux_transactions_user_external
-- were created as PARTIAL unique indexes (`where external_id is not null`).
-- The Syncfy sync code in api/_lib/sync.ts upserts via PostgREST with
-- `on_conflict=user_id,external_id`, which generates `INSERT ... ON CONFLICT
-- (user_id, external_id) DO UPDATE`. PostgreSQL's ON CONFLICT *inference*
-- cannot match a partial index unless the same WHERE predicate is included
-- in the INSERT statement — and PostgREST exposes no way to pass it. Result:
-- every upsert returned 400, leaving "0 cuentas · 0 movimientos" after sync.
--
-- Fix: drop the partial indexes and recreate without the predicate. NULL
-- values in a btree unique index are still distinct (Postgres default is
-- NULLS DISTINCT), so manual accounts with `external_id=NULL` remain
-- allowed without conflict.

drop index if exists public.ux_accounts_user_external;
create unique index ux_accounts_user_external
  on public.accounts(user_id, external_id);

drop index if exists public.ux_transactions_user_external;
create unique index ux_transactions_user_external
  on public.transactions(user_id, external_id);
