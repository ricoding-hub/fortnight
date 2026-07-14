-- Re-assert ALL split_* RLS so a partially-applied migration 022 can't leave
-- a table with RLS enabled but no valid INSERT policy.
--
-- Symptom this fixes: creating/opening/settling with a NEW contact failed with
--   42501: new row violates row-level security policy for table "split_groups"
-- `loans` (untouched by 022) kept working with the same auth pattern, which
-- pinpointed the missing "creator insert groups" policy on split_groups.
--
-- Fully idempotent and self-contained: safe whether the DB is at 021,
-- partially-022, or fully-022. Only DDL (columns/function/policies/grants) —
-- no data is touched.

-- ============================================================
-- 1. Columns the membership policies reference (022 §2 / §3)
--    add-if-not-exists so this works even if 022 died before them.
-- ============================================================

alter table public.split_members
  add column if not exists member_user_id uuid references auth.users(id) on delete set null,
  add column if not exists left_at timestamptz;

alter table public.split_expense_shares
  add column if not exists group_id uuid references public.split_groups(id) on delete cascade;

-- ============================================================
-- 2. is_group_member — the recursion breaker (022 §4)
-- ============================================================

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.split_groups g
    where g.id = gid and g.user_id = auth.uid()
  ) or exists (
    select 1 from public.split_members m
    where m.group_id = gid and m.member_user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ============================================================
-- 3. RLS enabled on every split_* table
-- ============================================================

alter table public.split_groups         enable row level security;
alter table public.split_members        enable row level security;
alter table public.split_expenses       enable row level security;
alter table public.split_expense_shares enable row level security;
alter table public.split_settlements    enable row level security;

-- ============================================================
-- 4. Membership-based policies (022 §5) — drop the old owner-only
--    ones too, then recreate everything. Idempotent.
-- ============================================================

drop policy if exists "own split_groups"         on public.split_groups;
drop policy if exists "own split_members"        on public.split_members;
drop policy if exists "own split_expenses"       on public.split_expenses;
drop policy if exists "own split_expense_shares" on public.split_expense_shares;
drop policy if exists "own split_settlements"    on public.split_settlements;

-- split_groups
drop policy if exists "member select groups" on public.split_groups;
create policy "member select groups"
  on public.split_groups for select
  using (public.is_group_member(id));
drop policy if exists "creator insert groups" on public.split_groups;
create policy "creator insert groups"
  on public.split_groups for insert
  with check (auth.uid() = user_id);
drop policy if exists "member update groups" on public.split_groups;
create policy "member update groups"
  on public.split_groups for update
  using (public.is_group_member(id));
drop policy if exists "owner delete groups" on public.split_groups;
create policy "owner delete groups"
  on public.split_groups for delete
  using (auth.uid() = user_id);

-- split_members
drop policy if exists "member select members" on public.split_members;
create policy "member select members"
  on public.split_members for select
  using (public.is_group_member(group_id));
drop policy if exists "member insert members" on public.split_members;
create policy "member insert members"
  on public.split_members for insert
  with check (public.is_group_member(group_id) and auth.uid() = user_id);
drop policy if exists "member update members" on public.split_members;
create policy "member update members"
  on public.split_members for update
  using (public.is_group_member(group_id));
drop policy if exists "owner delete members" on public.split_members;
create policy "owner delete members"
  on public.split_members for delete
  using (auth.uid() = (select g.user_id from public.split_groups g where g.id = group_id));

-- split_expenses
drop policy if exists "member select expenses" on public.split_expenses;
create policy "member select expenses"
  on public.split_expenses for select
  using (public.is_group_member(group_id));
drop policy if exists "member insert expenses" on public.split_expenses;
create policy "member insert expenses"
  on public.split_expenses for insert
  with check (public.is_group_member(group_id) and auth.uid() = user_id);
drop policy if exists "member update expenses" on public.split_expenses;
create policy "member update expenses"
  on public.split_expenses for update
  using (public.is_group_member(group_id));
drop policy if exists "member delete expenses" on public.split_expenses;
create policy "member delete expenses"
  on public.split_expenses for delete
  using (public.is_group_member(group_id));

-- split_expense_shares
drop policy if exists "member select shares" on public.split_expense_shares;
create policy "member select shares"
  on public.split_expense_shares for select
  using (public.is_group_member(group_id));
drop policy if exists "member insert shares" on public.split_expense_shares;
create policy "member insert shares"
  on public.split_expense_shares for insert
  with check (public.is_group_member(group_id) and auth.uid() = user_id);
drop policy if exists "member update shares" on public.split_expense_shares;
create policy "member update shares"
  on public.split_expense_shares for update
  using (public.is_group_member(group_id));
drop policy if exists "member delete shares" on public.split_expense_shares;
create policy "member delete shares"
  on public.split_expense_shares for delete
  using (public.is_group_member(group_id));

-- split_settlements
drop policy if exists "member select settlements" on public.split_settlements;
create policy "member select settlements"
  on public.split_settlements for select
  using (public.is_group_member(group_id));
drop policy if exists "member insert settlements" on public.split_settlements;
create policy "member insert settlements"
  on public.split_settlements for insert
  with check (public.is_group_member(group_id) and auth.uid() = user_id);
drop policy if exists "member update settlements" on public.split_settlements;
create policy "member update settlements"
  on public.split_settlements for update
  using (public.is_group_member(group_id));
drop policy if exists "member delete settlements" on public.split_settlements;
create policy "member delete settlements"
  on public.split_settlements for delete
  using (public.is_group_member(group_id));

-- ============================================================
-- 5. Grants (022 §9 + 021) — re-assert for both roles
-- ============================================================

grant select, insert, update, delete on public.split_groups         to authenticated;
grant select, insert, update, delete on public.split_members        to authenticated;
grant select, insert, update, delete on public.split_expenses       to authenticated;
grant select, insert, update, delete on public.split_expense_shares to authenticated;
grant select, insert, update, delete on public.split_settlements    to authenticated;

grant all on public.split_groups, public.split_members, public.split_expenses,
             public.split_expense_shares, public.split_settlements to service_role;

-- Make PostgREST pick up the refreshed policies immediately.
notify pgrst, 'reload schema';

-- ============================================================
-- Verification (run manually, read-only):
--   select polname, cmd from pg_policies
--   where schemaname='public' and tablename='split_groups';
--   -- must include: creator insert groups | INSERT
-- ============================================================
