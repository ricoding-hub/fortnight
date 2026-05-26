-- Add last sync summary columns to syncfy_credentials so the UI can show
-- what was imported on the most recent run without querying transactions.
alter table public.syncfy_credentials
  add column if not exists last_sync_accounts    int default 0,
  add column if not exists last_sync_transactions int default 0;
