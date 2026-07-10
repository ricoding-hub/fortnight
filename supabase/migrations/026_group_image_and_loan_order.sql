-- Group images + synced manual ordering of the loans list.
-- Idempotent and safely re-runnable, like 022-025.

-- Group photo for easier identification (any member can set it — the
-- existing "member update groups" policy already permits the write).
alter table public.split_groups
  add column if not exists image_url text;

-- Cloud-synced manual order of the loans list, so a pinned order (e.g.
-- Ale first) shows the same on every device. Shape:
--   { "activos": ["contact-key", ...], "grupos": ["group-id", ...] }
-- Keys not present fall back to recency ordering on the client.
alter table public.user_config
  add column if not exists loan_order jsonb not null default '{}'::jsonb;
