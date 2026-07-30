-- ============================================================================
-- SAPIENS — Phase 2, Chunk 3: matching (disclosure views, raise/veto/confirm)
-- ============================================================================
-- Staged disclosure enforced in DATA (PRD 0.4). A helper NEVER selects from
-- requests directly (no RLS policy lets them). Instead:
--   · helper_pings      → the limited pre-accept info (no seeker id, no coords)
--   · request_candidates→ what the seeker sees of a raised hand (PRD 9.4 fields)
--   · match_details     → precise meetpoint, released only to the two matched
--                         parties AFTER confirm
-- Each is a SECURITY DEFINER view filtered by auth.uid(), exposing only safe
-- columns — the client cannot fetch what the ladder hasn't unlocked.
-- ============================================================================

-- Rough, pre-computed distance stored at ping time so the helper can see
-- "how far" WITHOUT ever receiving the seeker's coordinates.
alter table public.dispatch_targets
  add column if not exists approx_distance_m integer;

-- ----------------------------------------------------------------------------
-- Recreate dispatch_wave to also store the rough distance (rounded to 50 m).
-- (Body identical to Chunk 2 plus approx_distance_m.)
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_wave(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          public.requests%rowtype;
  v_wave     int;
  v_size     int;
  v_radius_m double precision;
  v_start    jsonb;
  v_step     double precision;
  v_max      double precision;
  v_penalty  double precision;
  v_loc_age  int;
  v_lead     int;
  v_count    int;
begin
  select * into r from public.requests where id = p_request_id;
  if not found or r.status <> 'open' or r.meetpoint_geo is null then
    return 0;
  end if;

  if r.timing = 'scheduled' then
    select (value)::int into v_lead from public.dispatch_config where key = 'scheduled_lead_minutes';
    if r.scheduled_at is null or now() < r.scheduled_at - make_interval(mins => coalesce(v_lead, 60)) then
      return 0;
    end if;
  end if;

  select coalesce(max(wave_number), 0) + 1 into v_wave
  from public.dispatch_targets where request_id = p_request_id;

  select value into v_start      from public.dispatch_config where key = 'radius_start_m';
  select (value)::double precision into v_step from public.dispatch_config where key = 'radius_step_m';
  select (value)::double precision into v_max  from public.dispatch_config where key = 'radius_max_m';
  select (value ->> r.urgency::text)::int into v_size from public.dispatch_config where key = 'wave_size';
  select (value)::double precision into v_penalty from public.dispatch_config where key = 'fairness_penalty_m';
  select (value)::int into v_loc_age from public.dispatch_config where key = 'location_max_age_minutes';

  v_radius_m := least((v_start ->> r.urgency::text)::double precision + (v_wave - 1) * v_step, v_max);
  v_size := coalesce(v_size, 4);

  insert into public.dispatch_targets (request_id, helper_id, wave_number, outcome, approx_distance_m)
  select p_request_id, cand.user_id, v_wave, 'pending', (round(cand.dist_m / 50) * 50)::int
  from (
    select
      hp.user_id,
      extensions.st_distance(hp.last_location, r.meetpoint_geo) as dist_m,
      coalesce(pr.gender, '') as gender,
      (select count(*) from public.dispatch_targets dt2
        where dt2.helper_id = hp.user_id
          and dt2.pinged_at > now() - interval '2 hours') as recent_pings
    from public.helper_preferences hp
    join public.profiles pr on pr.id = hp.user_id
    where hp.user_id <> r.seeker_id
      and pr.verified = true
      and hp.last_location is not null
      and (v_loc_age is null or hp.location_updated_at > now() - make_interval(mins => v_loc_age))
      and r.category_id = any (hp.categories)
      and extensions.st_dwithin(hp.last_location, r.meetpoint_geo, v_radius_m)
      and extensions.st_dwithin(hp.last_location, r.meetpoint_geo, hp.radius_max_m)
      and not exists (
        select 1 from public.dispatch_targets dt
        where dt.request_id = p_request_id and dt.helper_id = hp.user_id)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = r.seeker_id and b.blocked_id = hp.user_id)
           or (b.blocker_id = hp.user_id and b.blocked_id = r.seeker_id))
      and not exists (
        select 1 from public.matches m
        where m.helper_id = hp.user_id
          and m.status in ('confirmed', 'on_the_way', 'arrived'))
      and not public.in_quiet_hours(hp.quiet_hours)
  ) cand
  order by
    case when r.prefer_women and cand.gender = 'female' then 0 else 1 end,
    (cand.dist_m + cand.recent_pings * v_penalty) asc
  limit v_size;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- VIEW 1 — helper_pings: what a pinged helper may see BEFORE accepting
-- (PRD 10.6): help type, urgency, approx area, rough distance, how long ago.
-- No seeker id. No coordinates.
-- ----------------------------------------------------------------------------
create view public.helper_pings with (security_invoker = off) as
  select
    dt.id            as dispatch_id,
    dt.request_id,
    dt.wave_number,
    dt.pinged_at,
    dt.outcome,
    dt.approx_distance_m,
    r.category_id,
    c.label          as category_label,
    c.icon           as category_icon,
    r.urgency,
    r.timing,
    r.scheduled_at,
    r.approx_area,
    r.description,
    r.status         as request_status,
    r.expires_at,
    r.prefer_women
  from public.dispatch_targets dt
  join public.requests r   on r.id = dt.request_id
  join public.categories c on c.id = r.category_id
  where dt.helper_id = (select auth.uid());

revoke all on public.helper_pings from anon;
grant select on public.helper_pings to authenticated;

-- ----------------------------------------------------------------------------
-- VIEW 2 — request_candidates: what the SEEKER sees of a raised hand
-- (PRD 9.4): first name, verified photo, distance, Celestial stage, star
-- rating, member since. Nothing more until connection.
-- ----------------------------------------------------------------------------
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
    dt.approx_distance_m
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.profiles  p on p.id = rr.helper_id
  left join public.dispatch_targets dt
    on dt.request_id = rr.request_id and dt.helper_id = rr.helper_id
  where r.seeker_id = (select auth.uid())
    and rr.status = 'raised';

revoke all on public.request_candidates from anon;
grant select on public.request_candidates to authenticated;

-- ----------------------------------------------------------------------------
-- VIEW 3 — match_details: precise meetpoint, released only to the two parties
-- AFTER confirm. Each party sees the OTHER party's limited profile.
-- ----------------------------------------------------------------------------
create view public.match_details with (security_invoker = off) as
  select
    m.id,
    m.request_id,
    m.helper_id,
    m.seeker_id,
    m.status,
    m.meetup_code,
    m.confirmed_at,
    m.helper_done_at,
    m.seeker_confirmed_at,
    m.completed_at,
    r.meetpoint_lat,
    r.meetpoint_lng,
    r.approx_area,
    r.description,
    r.category_id,
    c.label as category_label,
    c.icon  as category_icon,
    r.urgency,
    (case when (select auth.uid()) = m.helper_id then m.seeker_id else m.helper_id end) as other_id,
    op.display_name       as other_name,
    op.display_photo_url  as other_photo,
    op.celestial_stage    as other_stage,
    op.trust_rating_avg   as other_trust
  from public.matches m
  join public.requests r   on r.id = m.request_id
  join public.categories c on c.id = r.category_id
  join public.profiles op
    on op.id = (case when (select auth.uid()) = m.helper_id then m.seeker_id else m.helper_id end)
  where (select auth.uid()) in (m.helper_id, m.seeker_id);

revoke all on public.match_details from anon;
grant select on public.match_details to authenticated;

-- ----------------------------------------------------------------------------
-- RPC — raise_hand: a pinged, verified helper offers to help
-- ----------------------------------------------------------------------------
create or replace function public.raise_hand(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_helper uuid := auth.uid();
begin
  if v_helper is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.dispatch_targets
    where request_id = p_request_id and helper_id = v_helper
  ) then
    raise exception 'not pinged for this request';
  end if;
  if not coalesce((select verified from public.profiles where id = v_helper), false) then
    raise exception 'not verified';
  end if;
  if not exists (select 1 from public.requests where id = p_request_id and status = 'open') then
    raise exception 'request not open';
  end if;

  insert into public.request_responses (request_id, helper_id, status)
    values (p_request_id, v_helper, 'raised')
  on conflict (request_id, helper_id) do update set status = 'raised', updated_at = now();

  update public.dispatch_targets set outcome = 'raised'
    where request_id = p_request_id and helper_id = v_helper;
end;
$$;

revoke all on function public.raise_hand(uuid) from public, anon;
grant execute on function public.raise_hand(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC — withdraw_hand: a helper takes their hand back while still open
-- ----------------------------------------------------------------------------
create or replace function public.withdraw_hand(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_helper uuid := auth.uid();
begin
  if v_helper is null then raise exception 'not authenticated'; end if;
  update public.request_responses set status = 'withdrawn', updated_at = now()
    where request_id = p_request_id and helper_id = v_helper and status = 'raised';
  update public.dispatch_targets set outcome = 'ignored'
    where request_id = p_request_id and helper_id = v_helper;
end;
$$;

revoke all on function public.withdraw_hand(uuid) from public, anon;
grant execute on function public.withdraw_hand(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC — veto_helper: the seeker declines the current candidate (PRD 0.3)
-- Silent to the next; the vetoed helper only ever sees "matched with someone
-- else". Request stays open so re-broadcast continues.
-- ----------------------------------------------------------------------------
create or replace function public.veto_helper(p_request_id uuid, p_helper_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seeker uuid := auth.uid();
begin
  if v_seeker is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.requests
    where id = p_request_id and seeker_id = v_seeker
  ) then
    raise exception 'not your request';
  end if;
  update public.request_responses set status = 'vetoed', updated_at = now()
    where request_id = p_request_id and helper_id = p_helper_id and status = 'raised';
end;
$$;

revoke all on function public.veto_helper(uuid, uuid) from public, anon;
grant execute on function public.veto_helper(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC — confirm_helper: the seeker confirms → match created, location released
-- ----------------------------------------------------------------------------
create or replace function public.confirm_helper(p_request_id uuid, p_helper_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seeker   uuid := auth.uid();
  v_match_id uuid;
  v_code     text;
begin
  if v_seeker is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.requests
    where id = p_request_id and seeker_id = v_seeker and status = 'open'
  ) then
    raise exception 'request not open or not yours';
  end if;
  if not exists (
    select 1 from public.request_responses
    where request_id = p_request_id and helper_id = p_helper_id and status = 'raised'
  ) then
    raise exception 'helper has not raised a hand';
  end if;

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');

  insert into public.matches (request_id, helper_id, seeker_id, status, meetup_code, confirmed_at)
    values (p_request_id, p_helper_id, v_seeker, 'confirmed', v_code, now())
    returning id into v_match_id;

  update public.request_responses set status = 'confirmed', updated_at = now()
    where request_id = p_request_id and helper_id = p_helper_id;

  -- Other raised hands are released — they see "matched with someone else".
  update public.request_responses set status = 'vetoed', updated_at = now()
    where request_id = p_request_id and status = 'raised' and helper_id <> p_helper_id;
  update public.dispatch_targets set outcome = 'expired'
    where request_id = p_request_id and helper_id <> p_helper_id
      and outcome in ('pending', 'raised');

  update public.requests set status = 'matched' where id = p_request_id;

  return v_match_id;
end;
$$;

revoke all on function public.confirm_helper(uuid, uuid) from public, anon;
grant execute on function public.confirm_helper(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — the two parties watch the match live
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.matches;
