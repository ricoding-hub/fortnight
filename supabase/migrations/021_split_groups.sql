-- Mini-split: shared expense groups with N members, split methods, and
-- settlements. Purely additive — the loans table stays the 1:1 legacy
-- ledger; existing loans get stamped with an optional group_id so each
-- contact becomes a 2-person group. Zero data loss: the only statement
-- touching existing rows is the group_id UPDATE on a new nullable column.

-- ============================================================
-- Tables
-- ============================================================

create table public.split_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table public.split_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.split_groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  is_me      boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index uq_split_members_name on public.split_members (group_id, lower(trim(name)));
create unique index uq_split_members_me   on public.split_members (group_id) where is_me;

create table public.split_expenses (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.split_groups(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  description       text not null,
  amount            numeric(12,2) not null check (amount > 0),
  paid_by_member_id uuid not null references public.split_members(id) on delete restrict,
  split_method      text not null check (split_method in ('equal','percentage','exact','shares')),
  account_id        uuid references public.accounts(id) on delete set null,
  expense_date      date not null default current_date,
  created_at        timestamptz not null default now()
);

create table public.split_expense_shares (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.split_expenses(id) on delete cascade,
  member_id  uuid not null references public.split_members(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     numeric(12,2) not null check (amount >= 0),
  weight     numeric(9,4),
  created_at timestamptz not null default now(),
  unique (expense_id, member_id)
);

create table public.split_settlements (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.split_groups(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  from_member_id uuid not null references public.split_members(id) on delete restrict,
  to_member_id   uuid not null references public.split_members(id) on delete restrict,
  amount         numeric(12,2) not null check (amount > 0),
  note           text,
  account_id     uuid references public.accounts(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

-- ============================================================
-- loans: optional link to a split group
-- ============================================================

alter table public.loans
  add column if not exists group_id uuid references public.split_groups(id) on delete set null;

create index if not exists idx_loans_group on public.loans(group_id) where group_id is not null;

-- ============================================================
-- RLS + grants (pattern from 018)
-- ============================================================

alter table public.split_groups         enable row level security;
alter table public.split_members        enable row level security;
alter table public.split_expenses       enable row level security;
alter table public.split_expense_shares enable row level security;
alter table public.split_settlements    enable row level security;

create policy "own split_groups"
  on public.split_groups for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own split_members"
  on public.split_members for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own split_expenses"
  on public.split_expenses for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own split_expense_shares"
  on public.split_expense_shares for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own split_settlements"
  on public.split_settlements for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.split_groups         to authenticated;
grant select, insert, update, delete on public.split_members        to authenticated;
grant select, insert, update, delete on public.split_expenses       to authenticated;
grant select, insert, update, delete on public.split_expense_shares to authenticated;
grant select, insert, update, delete on public.split_settlements    to authenticated;

create index idx_split_groups_user      on public.split_groups(user_id);
create index idx_split_members_group    on public.split_members(group_id);
create index idx_split_expenses_group   on public.split_expenses(group_id);
create index idx_split_shares_expense   on public.split_expense_shares(expense_id);
create index idx_split_settlements_group on public.split_settlements(group_id);

alter publication supabase_realtime add table public.split_groups;
alter publication supabase_realtime add table public.split_members;
alter publication supabase_realtime add table public.split_expenses;
alter publication supabase_realtime add table public.split_expense_shares;
alter publication supabase_realtime add table public.split_settlements;

-- ============================================================
-- Backfill: one 2-person group per (user, contact) with loans.
-- Additive only — loans keep every value; group_id fills where NULL.
-- ============================================================

with contacts as (
  select user_id,
         lower(trim(name)) as contact_key,
         min(trim(name))   as display_name
  from public.loans
  group by user_id, lower(trim(name))
),
created as (
  insert into public.split_groups (user_id, name)
  select user_id, display_name from contacts
  returning id, user_id, name
),
me_members as (
  -- 'Tú' fallback avoids the unique-name collision if a contact is named 'Yo'
  insert into public.split_members (group_id, user_id, name, is_me)
  select id, user_id,
         case when lower(trim(name)) = 'yo' then 'Tú' else 'Yo' end,
         true
  from created
  returning id
)
insert into public.split_members (group_id, user_id, name, is_me)
select id, user_id, name, false from created;

update public.loans l
set group_id = g.id
from public.split_groups g
where l.group_id is null
  and g.user_id = l.user_id
  and lower(trim(g.name)) = lower(trim(l.name));

-- Verification (run manually, read-only):
--   select count(*) from public.split_groups;                       -- == distinct contacts
--   select count(*) from public.loans where group_id is null;       -- == 0
--   select group_id, count(*) from public.split_members group by 1
--     having count(*) <> 2;                                         -- empty
