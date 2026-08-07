-- ============================================================================
-- SAPIENS — PRE-LAUNCH TEARDOWN  (RUN MANUALLY, ONCE, BEFORE PUBLIC LAUNCH)
-- ============================================================================
-- This file is intentionally NOT in supabase/migrations/, so `supabase db push`
-- never applies it while you are still testing. Run it by hand (Supabase SQL
-- editor) as the final step before opening to the public, then confirm each
-- object is gone.
--
-- It removes the DEV/STAGING-ONLY database backdoors that must not exist in
-- production. After running it, the dev scripts that depend on them
-- (app/scripts/reset-help-data.mjs, dispatch-harness.mjs, seed-*.mjs) will stop
-- working — that is intended. Do not deploy those scripts to production.
-- ============================================================================

-- Destructive: TRUNCATEs all help/moment/notification data past the append-only
-- ledger. Never acceptable in production.
drop function if exists public.admin_reset_help_data();

-- Service-role helper that sets any user's location — a test harness aid.
drop function if exists public.admin_set_helper_location(uuid, double precision, double precision);

-- After running, verify (should return no rows):
--   select proname from pg_proc
--   where proname in ('admin_reset_help_data', 'admin_set_helper_location');
