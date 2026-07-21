-- Shared expenses can now carry a category (reusing the per-user `categories`
-- taxonomy, exactly like `transactions.category_id`). Optional: the client
-- auto-suggests one from the description via a keyword matcher, and the user
-- can override or clear it.
--
-- Purely additive: one nullable FK column. On category delete the reference is
-- cleared (the expense survives, just uncategorized). Idempotent.

alter table public.split_expenses
  add column if not exists category_id uuid references public.categories(id) on delete set null;

create index if not exists idx_split_expenses_category
  on public.split_expenses(category_id) where category_id is not null;

-- Let PostgREST see the new column immediately.
notify pgrst, 'reload schema';
