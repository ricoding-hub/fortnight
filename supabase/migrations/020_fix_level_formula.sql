-- Fix level formula in XP trigger to match client-side LEVEL_XP thresholds.
-- Old formula: floor(xp/500)+1  (diverges from client at 1000 XP)
-- New formula: stepped CASE matching [0, 100, 250, 500, 900, 1500]

create or replace function public.award_xp_on_transaction()
returns trigger language plpgsql security definer as $$
declare
  v_xp      int  := 15;
  v_today   date := current_date;
  v_row     public.user_gamification%rowtype;
  v_streak  int;
  v_new_xp  int;
  v_new_lv  int;
begin
  -- Skip adjustments — only real user transactions earn XP
  if NEW.type = 'adjustment' then return NEW; end if;

  select * into v_row
  from public.user_gamification
  where user_id = NEW.user_id;

  if not found then
    insert into public.user_gamification(user_id, xp, level, streak_days, last_activity_date)
    values (NEW.user_id, v_xp, 1, 1, v_today);
    return NEW;
  end if;

  -- Streak logic
  if v_row.last_activity_date = v_today then
    v_streak := v_row.streak_days;
    v_xp     := 0;                          -- no double XP same day
  elsif v_row.last_activity_date = v_today - 1 then
    v_streak := v_row.streak_days + 1;      -- continuing streak
  else
    v_streak := 1;                          -- streak reset
  end if;

  v_new_xp := v_row.xp + v_xp;

  -- Stepped thresholds matching client LEVEL_XP = [0, 100, 250, 500, 900, 1500]
  v_new_lv := case
    when v_new_xp >= 1500 then 6
    when v_new_xp >= 900  then 5
    when v_new_xp >= 500  then 4
    when v_new_xp >= 250  then 3
    when v_new_xp >= 100  then 2
    else 1
  end;

  update public.user_gamification set
    xp                 = v_new_xp,
    streak_days        = v_streak,
    last_activity_date = v_today,
    level              = v_new_lv,
    updated_at         = now()
  where user_id = NEW.user_id;

  return NEW;
end;
$$;
