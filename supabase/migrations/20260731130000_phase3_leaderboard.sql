-- ============================================================================
-- SAPIENS — Phase 3, Chunk 4: the monthly leaderboard (PRD 7.9)
-- ============================================================================
-- Ranked by NEW lifetime-unique people met THIS MONTH (Model A): helping a
-- repeat person ranks you nowhere. Since a Moneta 'earned' row exists only on
-- the first-ever help with a person, counting this month's earned rows per
-- helper is exactly "new people reached this month". Recognition only, ranked
-- by uniques (never a raw help count) — impossible to game by repetition.
--
-- SECURITY DEFINER view exposing only safe columns (name/photo/stage + count).
-- Area filters (zip/city/…) need a stored user area — a later addition; v1 is
-- the whole community, which fits the closed-community launch.
-- ============================================================================

create view public.leaderboard_month with (security_invoker = off) as
  select
    ml.user_id,
    p.display_name,
    p.display_photo_url,
    p.celestial_stage,
    count(*)::int                                    as new_uniques,
    rank() over (order by count(*) desc)::int        as rank
  from public.moneta_ledger ml
  join public.profiles p on p.id = ml.user_id
  where ml.type = 'earned'
    and ml.created_at >= date_trunc('month', now())
  group by ml.user_id, p.display_name, p.display_photo_url, p.celestial_stage;

revoke all on public.leaderboard_month from anon;
grant select on public.leaderboard_month to authenticated;
