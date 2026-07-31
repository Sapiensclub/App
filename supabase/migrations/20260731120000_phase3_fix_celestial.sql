-- ============================================================================
-- SAPIENS — Phase 3: fix celestial stage thresholds (PRD 7.8)
-- ============================================================================
-- Chunk 1's celestial_stage_for skipped 'sunrise' and mislabelled 1000+.
-- Correct ladder (by unique people helped):
--   new moon 0 · crescent 10 · half 50 · full 100 · sunrise 500 · golden sun 1000
-- (All test help data was reset, so no backfill is needed.)
-- ============================================================================

create or replace function public.celestial_stage_for(p_unique integer)
returns public.celestial_stage
language sql immutable set search_path = '' as $$
  select case
    when p_unique >= 1000 then 'golden_sun'::public.celestial_stage
    when p_unique >= 500  then 'sunrise'::public.celestial_stage
    when p_unique >= 100  then 'full_moon'::public.celestial_stage
    when p_unique >= 50   then 'half_moon'::public.celestial_stage
    when p_unique >= 10   then 'crescent'::public.celestial_stage
    else 'new_moon'::public.celestial_stage
  end;
$$;
