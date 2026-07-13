-- Force PostgREST to reload its schema cache. After migration 026 added
-- columns (split_groups.image_url, user_config.loan_order), a stale cache
-- can make writes to those tables fail until the cache refreshes. This
-- notify is harmless and safely re-runnable.
notify pgrst, 'reload schema';
