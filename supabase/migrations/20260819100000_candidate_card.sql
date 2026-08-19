-- ============================================================================
-- SAPIENS — richer candidate card (owner-approved 2026-08-19)
-- ============================================================================
-- When a helper raises a hand, the seeker decides mostly on trust — so the
-- card now also shows the two strongest signals we have:
--   · unique_helps  → "has helped N neighbours" (server-computed, ungameable)
--   · bio           → the helper's own one-liner
-- Still constitution-safe: this is NOT browsing. The row exists only after
-- that helper raised a hand on YOUR open request (PRD 9.4 staged disclosure).
--
-- DROP+CREATE (not or-replace): the project rule for view shape changes.

drop view if exists public.request_candidates;

create view public.request_candidates with (security_invoker = off) as
  select
    rr.request_id,
    rr.helper_id,
    rr.status         as response_status,
    rr.created_at     as raised_at,
    p.display_name,
    p.display_photo_url,
    p.celestial_stage,
    p.trust_rating_avg,
    p.member_since,
    dt.approx_distance_m,
    p.unique_helps,
    p.bio
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.profiles  p on p.id = rr.helper_id
  left join public.dispatch_targets dt
    on dt.request_id = rr.request_id and dt.helper_id = rr.helper_id
  where r.seeker_id = (select auth.uid())
    and rr.status = 'raised';

revoke all on public.request_candidates from anon;
grant select on public.request_candidates to authenticated;
