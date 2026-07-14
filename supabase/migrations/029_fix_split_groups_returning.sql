-- Fix: creating a brand-new direct connection (a 2-person split group) failed with
--   42501: new row violates row-level security policy for table "split_groups"
-- even though the INSERT policy (auth.uid() = user_id) is correct and present.
--
-- Root cause — INSERT ... RETURNING vs a function-based SELECT policy:
--   `createGroup` inserts the group with `.select('id')`, i.e. INSERT ... RETURNING.
--   PostgreSQL treats a RETURNING clause as a SELECT, so it evaluates the table's
--   SELECT policy against the just-inserted row. split_groups' SELECT policy was
--   USING (public.is_group_member(id)); that helper is STABLE + SECURITY DEFINER
--   and RE-QUERIES split_groups. Its snapshot does NOT include the row being
--   inserted in the same command, so the owner lookup returns nothing and the
--   RETURNING row is rejected -> 42501. The WITH CHECK on the INSERT itself passes
--   fine — it's the RETURNING/SELECT step that fails.
--
--   `loans` never hit this because its SELECT policy is the DIRECT column check
--   `auth.uid() = user_id`, which reads the new row's own column and needs no
--   snapshot of the table. That is exactly the difference in behaviour the user saw.
--
-- Fix: let the SELECT policy pass directly for the owner via the row's own
-- user_id column (no subquery), falling back to is_group_member for co-members.
-- Idempotent and data-safe.

drop policy if exists "member select groups" on public.split_groups;
create policy "member select groups"
  on public.split_groups for select
  using (user_id = auth.uid() or public.is_group_member(id));

notify pgrst, 'reload schema';

-- ============================================================
-- Verification (run manually):
--   Creating a connection with a new contact must now succeed. As a smoke test
--   under the authenticated role (replace <UID> with your auth.users id):
--     begin;
--       set local role authenticated;
--       set local request.jwt.claims to '{"sub":"<UID>","role":"authenticated"}';
--       insert into public.split_groups (user_id, name)
--         values ('<UID>', 'prueba conexion') returning id;   -- must return a row, no 42501
--     rollback;
-- ============================================================
