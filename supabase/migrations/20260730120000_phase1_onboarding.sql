-- ============================================================================
-- SAPIENS — Phase 1, Chunk 1: onboarding
-- ============================================================================
-- Tracks whether a user has finished the one-time first-run flow (walkthrough
-- + trusted contacts + welcome). Owner-writable (unlike verified/photo, which
-- stay server-only): completing onboarding is a harmless client action.
-- ============================================================================

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Let the owner mark their own onboarding complete. The Phase 0 policy already
-- grants UPDATE only on (display_name, bio); extend that grant to onboarded_at.
grant update (onboarded_at) on public.profiles to authenticated;
