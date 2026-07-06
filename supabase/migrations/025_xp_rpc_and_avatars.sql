-- Pre-stable audit fixes (server side):
-- 1. Atomic XP awards — the client used to write an ABSOLUTE xp value from
--    a possibly-stale snapshot, clobbering XP the transaction trigger had
--    just awarded (the "XP keeps resetting" bug). add_xp() increments
--    atomically and derives the level with the same stepped thresholds
--    as the client and the trigger.
-- 2. Avatars storage — the 'avatars' bucket and its policies never existed,
--    so every profile photo upload failed regardless of size.
--
-- Idempotent and safely re-runnable, like 022-024.

-- ============================================================
-- 1. add_xp — atomic XP increment
-- ============================================================

create or replace function public.add_xp(p_amount int)
returns public.user_gamification
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_gamification;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'invalid amount';
  end if;

  insert into public.user_gamification (user_id, xp, level, streak_days, last_activity_date)
  values (auth.uid(), 0, 1, 0, null)
  on conflict (user_id) do nothing;

  update public.user_gamification set
    xp = xp + p_amount,
    -- Stepped thresholds matching client LEVEL_XP = [0, 100, 250, 500, 900, 1500]
    level = case
      when xp + p_amount >= 1500 then 6
      when xp + p_amount >= 900  then 5
      when xp + p_amount >= 500  then 4
      when xp + p_amount >= 250  then 3
      when xp + p_amount >= 100  then 2
      else 1
    end,
    updated_at = now()
  where user_id = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.add_xp(int) from public, anon;
grant execute on function public.add_xp(int) to authenticated;

-- ============================================================
-- 2. avatars bucket + storage policies
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Uploads live under {auth.uid()}/{timestamp}.webp — each user owns
-- their own folder; the bucket is public for reads (avatar URLs).
drop policy if exists "avatars insert own folder" on storage.objects;
create policy "avatars insert own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update own folder" on storage.objects;
create policy "avatars update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- ============================================================
-- Verification (run manually, read-only):
--   select add_xp(15);                       -- returns the row, xp incremented
--   select * from storage.buckets where id = 'avatars';   -- 1 row
-- ============================================================
