-- Multi-user mini-split: public profiles, real linked members, membership
-- RLS, activity history written by triggers, split notifications and email
-- invitations. Purely additive — single-user groups keep working unchanged.
--
-- Zero data loss: only new tables/columns plus two backfills
-- (profiles from auth.users, member_user_id on is_me rows).

-- ============================================================
-- 1. profiles — public identity readable by group co-members
-- ============================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  email        text not null,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- NOTE: the "co-member profiles" policy (any co-member can read your
-- profile) is created further below, AFTER split_members.member_user_id
-- exists (added in Section 2) — it cannot be created here.

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Backfill existing users from auth metadata.
insert into public.profiles (id, display_name, avatar_url, email)
select id,
       coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
       raw_user_meta_data->>'avatar_url',
       email
from auth.users
on conflict (id) do nothing;

-- Extend the signup seeder to also create the profile row.
create or replace function public.seed_user_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind) values
    (NEW.id, 'Renta', 'fixed'),
    (NEW.id, 'Servicios', 'fixed'),
    (NEW.id, 'Suscripciones', 'fixed'),
    (NEW.id, 'Comida', 'variable'),
    (NEW.id, 'Social', 'variable'),
    (NEW.id, 'Transporte', 'variable'),
    (NEW.id, 'Salud', 'variable'),
    (NEW.id, 'Otros', 'variable'),
    (NEW.id, 'Salario', 'income'),
    (NEW.id, 'Vales', 'income'),
    (NEW.id, 'Extra', 'income');

  insert into public.user_config (user_id) values (NEW.id);

  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  )
  on conflict (id) do nothing;

  return NEW;
end;
$$;

-- ============================================================
-- 2. split_members — real linked users + soft leave
-- ============================================================

alter table public.split_members
  add column if not exists member_user_id uuid references auth.users(id) on delete set null,
  add column if not exists left_at timestamptz;

create unique index if not exists uq_split_members_user
  on public.split_members (group_id, member_user_id)
  where member_user_id is not null;

create index if not exists idx_split_members_member_user
  on public.split_members (member_user_id)
  where member_user_id is not null;

-- Backfill: the owner's is_me row IS the owner.
update public.split_members set member_user_id = user_id where is_me and member_user_id is null;

-- Co-members of any shared group can see each other's profile. Must come
-- after member_user_id exists on split_members (added just above).
drop policy if exists "co-member profiles" on public.profiles;
create policy "co-member profiles"
  on public.profiles for select
  using (exists (
    select 1
    from public.split_members m1
    join public.split_members m2 on m1.group_id = m2.group_id
    where m1.member_user_id = auth.uid()
      and m2.member_user_id = profiles.id
  ));

-- ============================================================
-- 3. split_expense_shares — denormalize group_id for sane RLS
-- ============================================================

alter table public.split_expense_shares
  add column if not exists group_id uuid references public.split_groups(id) on delete cascade;

update public.split_expense_shares s
set group_id = e.group_id
from public.split_expenses e
where e.id = s.expense_id and s.group_id is null;

alter table public.split_expense_shares alter column group_id set not null;

create index if not exists idx_split_shares_group on public.split_expense_shares(group_id);

-- ============================================================
-- 4. is_group_member — the recursion breaker
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
-- 5. Membership-based RLS (replaces owner-only policies)
--    Any member reads everything in their groups; any member can
--    edit/delete any expense (Splitwise model); destructive group
--    ops stay with the owner. INSERT attribution: user_id = creator.
-- ============================================================

drop policy if exists "own split_groups"         on public.split_groups;
drop policy if exists "own split_members"        on public.split_members;
drop policy if exists "own split_expenses"       on public.split_expenses;
drop policy if exists "own split_expense_shares" on public.split_expense_shares;
drop policy if exists "own split_settlements"    on public.split_settlements;

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
-- 6. split_activity — trigger-written audit history
-- ============================================================

create table if not exists public.split_activity (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.split_groups(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name    text not null,
  verb          text not null check (verb in (
    'group_created','group_renamed','member_added','member_linked','member_left',
    'expense_added','expense_edited','expense_deleted','settlement_added','invite_sent'
  )),
  subject       text,
  amount        numeric(12,2),
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.split_activity enable row level security;

drop policy if exists "member activity" on public.split_activity;
create policy "member activity"
  on public.split_activity for select
  using (public.is_group_member(group_id));

-- Read-only for clients: history is written exclusively by triggers.
grant select on public.split_activity to authenticated;
grant all on public.split_activity to service_role;

create index if not exists idx_split_activity_group on public.split_activity(group_id, created_at desc);

-- Idempotent add-to-publication (pattern from 011_gamification_score_missions.sql).
do $$
begin
  alter publication supabase_realtime add table public.split_activity;
exception
  when duplicate_object then null;
end $$;

-- Snapshot of the acting user's display name at write time.
create or replace function public.split_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select display_name from public.profiles where id = auth.uid()),
    'Alguien'
  );
$$;

-- groups: created / renamed
create or replace function public.log_split_group_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject)
    values (NEW.id, auth.uid(), public.split_actor_name(), 'group_created', NEW.name);
  elsif TG_OP = 'UPDATE' and NEW.name is distinct from OLD.name then
    insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject)
    values (NEW.id, auth.uid(), public.split_actor_name(), 'group_renamed', NEW.name);
  end if;
  return NEW;
end;
$$;

drop trigger if exists tr_log_split_group on public.split_groups;
create trigger tr_log_split_group
  after insert or update on public.split_groups
  for each row execute function public.log_split_group_activity();

-- members: added / linked / left
create or replace function public.log_split_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  if TG_OP = 'INSERT' then
    if not NEW.is_me then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject)
      values (NEW.group_id, auth.uid(), public.split_actor_name(), 'member_added', NEW.name);
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.member_user_id is not null and OLD.member_user_id is null then
      -- Linked via invite accept (may run under service role: auth.uid() null).
      v_actor := coalesce(
        (select display_name from public.profiles where id = NEW.member_user_id),
        NEW.name
      );
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject)
      values (NEW.group_id, NEW.member_user_id, v_actor, 'member_linked', NEW.name);
    elsif NEW.left_at is not null and OLD.left_at is null then
      insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject)
      values (NEW.group_id, auth.uid(), public.split_actor_name(), 'member_left', NEW.name);
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists tr_log_split_member on public.split_members;
create trigger tr_log_split_member
  after insert or update on public.split_members
  for each row execute function public.log_split_member_activity();

-- expenses: added / edited; deletion snapshots shares BEFORE the cascade.
create or replace function public.log_split_expense_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
    values (NEW.group_id, auth.uid(), public.split_actor_name(), 'expense_added',
            NEW.description, NEW.amount, jsonb_build_object('expense_id', NEW.id));
  elsif TG_OP = 'UPDATE' then
    insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
    values (NEW.group_id, auth.uid(), public.split_actor_name(), 'expense_edited',
            NEW.description, NEW.amount, jsonb_build_object('expense_id', NEW.id));
  end if;
  return NEW;
end;
$$;

drop trigger if exists tr_log_split_expense on public.split_expenses;
create trigger tr_log_split_expense
  after insert or update on public.split_expenses
  for each row execute function public.log_split_expense_activity();

create or replace function public.log_split_expense_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shares jsonb;
begin
  -- BEFORE DELETE: shares still exist; snapshot them so the feed can
  -- render each member's share of a deleted expense.
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', s.member_id, 'amount', s.amount)), '[]'::jsonb)
  into v_shares
  from public.split_expense_shares s
  where s.expense_id = OLD.id;

  insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
  values (OLD.group_id, auth.uid(), public.split_actor_name(), 'expense_deleted',
          OLD.description, OLD.amount, jsonb_build_object('shares', v_shares));
  return OLD;
end;
$$;

drop trigger if exists tr_log_split_expense_delete on public.split_expenses;
create trigger tr_log_split_expense_delete
  before delete on public.split_expenses
  for each row execute function public.log_split_expense_delete();

-- settlements
create or replace function public.log_split_settlement_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to   text;
begin
  select name into v_from from public.split_members where id = NEW.from_member_id;
  select name into v_to   from public.split_members where id = NEW.to_member_id;
  insert into public.split_activity (group_id, actor_user_id, actor_name, verb, subject, amount, meta)
  values (NEW.group_id, auth.uid(), public.split_actor_name(), 'settlement_added',
          coalesce(v_from, '—') || ' → ' || coalesce(v_to, '—'), NEW.amount,
          jsonb_build_object('from_member_id', NEW.from_member_id, 'to_member_id', NEW.to_member_id));
  return NEW;
end;
$$;

drop trigger if exists tr_log_split_settlement on public.split_settlements;
create trigger tr_log_split_settlement
  after insert on public.split_settlements
  for each row execute function public.log_split_settlement_activity();

-- ============================================================
-- 7. notifications — new 'split' type + tappable link + producer
-- ============================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('payment_due','payday','goal','mission','split'));

alter table public.notifications add column if not exists link text;

create or replace function public.notify_split_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_body       text;
begin
  if NEW.verb not in ('expense_added','expense_edited','expense_deleted',
                      'settlement_added','member_linked','member_left') then
    return NEW;
  end if;

  select name into v_group_name from public.split_groups where id = NEW.group_id;

  v_body := case NEW.verb
    when 'expense_added'    then NEW.actor_name || ' añadió "' || coalesce(NEW.subject,'') || '"'
    when 'expense_edited'   then NEW.actor_name || ' editó "' || coalesce(NEW.subject,'') || '"'
    when 'expense_deleted'  then NEW.actor_name || ' eliminó "' || coalesce(NEW.subject,'') || '"'
    when 'settlement_added' then NEW.actor_name || ' registró un pago: ' || coalesce(NEW.subject,'')
    when 'member_linked'    then NEW.actor_name || ' se unió al grupo'
    when 'member_left'      then coalesce(NEW.subject,'Alguien') || ' salió del grupo'
  end;
  if NEW.amount is not null then
    v_body := v_body || ' · $' || to_char(NEW.amount, 'FM999,999,990.00');
  end if;

  insert into public.notifications (user_id, type, title, body, dedup_key, link)
  select m.member_user_id, 'split', coalesce(v_group_name, 'Grupo'), v_body,
         'split:' || NEW.id, '/cuentas/prestamos/' || NEW.group_id
  from public.split_members m
  where m.group_id = NEW.group_id
    and m.member_user_id is not null
    and m.left_at is null
    and (NEW.actor_user_id is null or m.member_user_id <> NEW.actor_user_id)
  on conflict (user_id, dedup_key) do nothing;

  return NEW;
end;
$$;

drop trigger if exists tr_notify_split_activity on public.split_activity;
create trigger tr_notify_split_activity
  after insert on public.split_activity
  for each row execute function public.notify_split_activity();

-- ============================================================
-- 8. split_invites — email invitations (token hidden from clients)
-- ============================================================

create table if not exists public.split_invites (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.split_groups(id) on delete cascade,
  inviter_user_id   uuid not null references auth.users(id) on delete cascade,
  invited_member_id uuid references public.split_members(id) on delete cascade,
  email             text not null,
  token             uuid not null unique default gen_random_uuid(),
  status            text not null default 'pending'
                      check (status in ('pending','accepted','declined','revoked')),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz
);

alter table public.split_invites enable row level security;

drop policy if exists "member invites" on public.split_invites;
create policy "member invites"
  on public.split_invites for select
  using (public.is_group_member(group_id));

-- Column-level grant WITHOUT the token: a co-member must not be able to
-- read (and hijack) someone else's invite token. All writes go through
-- the service-role API routes.
grant select (id, group_id, inviter_user_id, invited_member_id, email, status, created_at, responded_at)
  on public.split_invites to authenticated;
grant all on public.split_invites to service_role;

create index if not exists idx_split_invites_group on public.split_invites(group_id);
create index if not exists idx_split_invites_token on public.split_invites(token) where status = 'pending';

-- ============================================================
-- 9. service_role grants for new tables (pattern from 012)
-- ============================================================

grant all on public.split_groups, public.split_members, public.split_expenses,
             public.split_expense_shares, public.split_settlements to service_role;

-- ============================================================
-- Verification (run manually, read-only):
--   select count(*) from public.split_members where is_me and member_user_id is null;  -- 0
--   select count(*) from public.split_expense_shares where group_id is null;           -- 0
--   select count(*) from public.profiles;              -- == count(*) from auth.users
--   -- As a linked member of a shared group:
--   --   select * from split_members;                  -- must not error (no recursion)
--   --   select token from split_invites;              -- must fail: permission denied
-- ============================================================
