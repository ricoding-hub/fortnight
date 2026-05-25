-- Fortnight — Grants for service_role + sync tables in realtime publication
--
-- Root cause of "permission denied for table syncfy_credentials":
-- Migration 006 granted privileges only to `authenticated`. Server-side
-- handlers in /api/syncfy/* use the SUPABASE_SERVICE_ROLE_KEY (bypasses
-- RLS), but the service_role still needs base table privileges to access
-- each table — and migration 003 only granted `authenticated`.
--
-- Fix: grant the service_role on every existing object in `public` and set
-- DEFAULT PRIVILEGES so any future migration's tables inherit the grants
-- automatically. This mirrors what Supabase configures on a fresh project
-- but applies it to objects we've created in our own migrations.
--
-- Also: add accounts, transactions, and syncfy_credentials to the realtime
-- publication so server-side inserts from the sync flow stream into the
-- client without a full refetch.

-- ============================================================
-- 1. service_role grants on existing objects (idempotent)
-- ============================================================
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- ============================================================
-- 2. Default privileges — future tables/sequences inherit grants
-- ============================================================
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ============================================================
-- 3. Sync-related tables → realtime publication
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.syncfy_credentials;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.accounts;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null; when undefined_object then null;
end $$;
