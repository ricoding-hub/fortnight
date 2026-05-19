-- Fortnight — Syncfy bank-aggregation integration (additive)
-- Adds a parent table for connected bank credentials plus columns on
-- accounts and transactions that let us dedupe imported rows.
-- The existing update_account_balance() trigger is preserved: it keeps
-- deriving accounts.balance from the sum of transactions for every row
-- regardless of source, so synced balances flow through it naturally.

-- ============================================================
-- syncfy_credentials  (one row per bank login, e.g. one Santander)
-- ============================================================
create table if not exists public.syncfy_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Syncfy's own identifiers — we forward these to /v1/* calls.
  syncfy_id_credential text not null,
  syncfy_id_user text not null,
  -- For UI: human-readable bank name and the Syncfy id_site for logos.
  institution_name text not null,
  institution_code text,
  -- Lifecycle status surfaced as a pill in the UI.
  status text not null default 'active'
    check (status in ('active','token_expired','login_required','disabled','error')),
  last_status_message text,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, syncfy_id_credential)
);

create index if not exists idx_syncfy_credentials_user
  on public.syncfy_credentials(user_id);

-- ============================================================
-- accounts: additive columns for synced rows
-- Existing rows default to source='manual', so nothing changes.
-- ============================================================
alter table public.accounts
  add column if not exists source text not null default 'manual'
    check (source in ('manual','syncfy')),
  add column if not exists syncfy_credential_id uuid
    references public.syncfy_credentials(id) on delete set null,
  add column if not exists external_id text,
  add column if not exists institution_name text,
  add column if not exists last_synced_at timestamptz;

-- Partial unique index — the dedupe primitive for upsert during sync.
create unique index if not exists ux_accounts_user_external
  on public.accounts(user_id, external_id)
  where external_id is not null;

-- ============================================================
-- transactions: additive columns for synced rows
-- ============================================================
alter table public.transactions
  add column if not exists source text not null default 'manual'
    check (source in ('manual','syncfy')),
  add column if not exists external_id text;

create unique index if not exists ux_transactions_user_external
  on public.transactions(user_id, external_id)
  where external_id is not null;

-- Allow type='sync' so synced rows are visually distinguishable from
-- both user-entered ('transaction') and balance-reconciliation rows
-- ('adjustment'). The existing balance trigger does not filter by type,
-- so it keeps firing for every insert/delete and the synced balance
-- flows through it correctly.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('transaction','adjustment','sync'));

-- ============================================================
-- RLS — credentials are user-scoped like every other table
-- ============================================================
alter table public.syncfy_credentials enable row level security;

drop policy if exists "own syncfy_credentials" on public.syncfy_credentials;
create policy "own syncfy_credentials" on public.syncfy_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.syncfy_credentials to authenticated;

-- ============================================================
-- View: per-synced-account cursor for incremental sync.
-- Returns the most recent date we've already imported from Syncfy
-- per account; the sync function uses this minus a 7-day overlap
-- window to ask Syncfy only for new transactions.
-- ============================================================
create or replace view public.v_syncfy_account_cursor
  with (security_invoker = true) as
  select a.id as account_id,
         a.user_id,
         a.external_id,
         max(t.date) as last_imported_date
  from public.accounts a
  left join public.transactions t
    on t.account_id = a.id
    and t.source = 'syncfy'
    and t.external_id is not null
  where a.source = 'syncfy'
  group by a.id, a.user_id, a.external_id;

grant select on public.v_syncfy_account_cursor to authenticated;
