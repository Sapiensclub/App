-- ============================================================================
-- SAPIENS — Phase 8, Chunk 1: leaderboard privacy fix
-- ============================================================================
-- Security review finding: leaderboard_month exposed the raw user_id of every
-- ranked member to all authenticated viewers — a stable identifier that enables
-- cross-surface linking (mild profile-surfing). The board only needs to
-- celebrate people by name and mark the caller's own row, so we replace user_id
-- with an is_me boolean computed server-side. No id ever leaves the view.
-- (DROP + CREATE because the column list changes.)
-- ============================================================================
drop view if exists public.leaderboard_month;

create view public.leaderboard_month with (security_invoker = off) as
  select
    p.display_name,
    p.display_photo_url,
    p.celestial_stage,
    count(*)::int                                    as new_uniques,
    rank() over (order by count(*) desc)::int        as rank,
    (ml.user_id = (select auth.uid()))               as is_me
  from public.moneta_ledger ml
  join public.profiles p on p.id = ml.user_id
  where ml.type = 'earned'
    and ml.created_at >= date_trunc('month', now())
  group by ml.user_id, p.display_name, p.display_photo_url, p.celestial_stage;

revoke all on public.leaderboard_month from anon;
grant select on public.leaderboard_month to authenticated;
