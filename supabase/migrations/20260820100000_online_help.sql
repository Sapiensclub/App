-- ============================================================================
-- SAPIENS — Online help (owner-approved design, 2026-08-20)
-- ============================================================================
-- The SEEKER chooses per request: in person or online (no category gating).
-- Online requests have no meetpoint and no radius — they ping EVERY eligible
-- helper opted into the category (owner decision for the closed test; the
-- 'online_wave_size' dispatch_config key caps it later WITHOUT an app update —
-- no row = unlimited).
--
-- Meet flow online: confirmed → "Start helping" (reuses status 'arrived' =
-- "session started"; no new enum) → mark done → seeker confirm. The meetup
-- code becomes a session code read out on the call. The lapse sweeper skips
-- online matches (an online session may legitimately start much later).
--
-- Eligibility mirrors dispatch_wave MINUS geography — notably no GPS/location
-- requirement, so helpers who never shared location still get online pings.

-- ----------------------------------------------------------------------------
-- 1. Schema: the request-level choice.
-- ----------------------------------------------------------------------------
alter table public.requests
  add column is_online boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. dispatch_online: ping all eligible helpers (config-cappable).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_online(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests%rowtype;
  v_wave int; v_size int; v_lead int; v_cap int; v_count int;
begin
  select * into r from public.requests where id = p_request_id;
  if not found or r.status <> 'open' or not r.is_online then
    return 0;
  end if;

  -- Scheduled online sessions wait until near their time, same as dispatch_wave.
  if r.timing = 'scheduled' then
    select (value)::int into v_lead from public.dispatch_config where key = 'scheduled_lead_minutes';
    if r.scheduled_at is null or now() < r.scheduled_at - make_interval(mins => coalesce(v_lead, 60)) then
      return 0;
    end if;
  end if;

  select coalesce(max(wave_number), 0) + 1 into v_wave
  from public.dispatch_targets where request_id = p_request_id;

  -- No 'online_wave_size' row → v_size NULL → LIMIT ALL (owner decision:
  -- everyone during the closed test). Insert the row to cap it at scale.
  select (value)::int into v_size from public.dispatch_config where key = 'online_wave_size';
  select (value)::int into v_cap  from public.dispatch_config where key = 'daily_ping_cap';

  insert into public.dispatch_targets (request_id, helper_id, wave_number, outcome, approx_distance_m)
  select p_request_id, cand.user_id, v_wave, 'pending', null
  from (
    select hp.user_id,
      coalesce(pr.gender, '') as gender,
      (select count(*) from public.dispatch_targets dt2
        where dt2.helper_id = hp.user_id and dt2.pinged_at > now() - interval '2 hours') as recent_pings
    from public.helper_preferences hp
    join public.profiles pr on pr.id = hp.user_id
    where hp.user_id <> r.seeker_id
      and pr.verified = true
      and r.category_id = any (hp.categories)
      -- deliberately NO location requirement: online help needs no GPS
      and not exists (select 1 from public.dispatch_targets dt
                       where dt.request_id = p_request_id and dt.helper_id = hp.user_id)
      and not exists (select 1 from public.blocks b
                       where (b.blocker_id = r.seeker_id and b.blocked_id = hp.user_id)
                          or (b.blocker_id = hp.user_id and b.blocked_id = r.seeker_id))
      and not exists (select 1 from public.matches m
                       where m.helper_id = hp.user_id
                         and m.status in ('confirmed', 'on_the_way', 'arrived'))
      and not public.in_quiet_hours(hp.quiet_hours)
      and (v_cap is null or (
        select count(*) from public.dispatch_targets dtc
        where dtc.helper_id = hp.user_id and dtc.pinged_at >= date_trunc('day', now())
      ) < v_cap)
  ) cand
  order by
    case when r.prefer_women and cand.gender = 'female' then 0 else 1 end,
    cand.recent_pings asc
  limit v_size;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. dispatch_wave: branch to dispatch_online for online requests. Body is
--    otherwise the Phase-2 group-hardening version, unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_wave(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests%rowtype;
  v_wave int; v_size int; v_radius_m double precision;
  v_start jsonb; v_step double precision; v_max double precision;
  v_penalty double precision; v_loc_age int; v_lead int; v_cap int; v_count int;
begin
  select * into r from public.requests where id = p_request_id;
  if not found or r.status <> 'open' then
    return 0;
  end if;

  -- Online requests have their own (geography-free) dispatch.
  if r.is_online then
    return public.dispatch_online(p_request_id);
  end if;

  if r.meetpoint_geo is null then
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

  select value into v_start from public.dispatch_config where key = 'radius_start_m';
  select (value)::double precision into v_step from public.dispatch_config where key = 'radius_step_m';
  select (value)::double precision into v_max  from public.dispatch_config where key = 'radius_max_m';
  select (value ->> r.urgency::text)::int into v_size from public.dispatch_config where key = 'wave_size';
  select (value)::double precision into v_penalty from public.dispatch_config where key = 'fairness_penalty_m';
  select (value)::int into v_loc_age from public.dispatch_config where key = 'location_max_age_minutes';
  select (value)::int into v_cap from public.dispatch_config where key = 'daily_ping_cap';

  v_radius_m := least((v_start ->> r.urgency::text)::double precision + (v_wave - 1) * v_step, v_max);
  v_size := coalesce(v_size, 4);

  insert into public.dispatch_targets (request_id, helper_id, wave_number, outcome, approx_distance_m)
  select p_request_id, cand.user_id, v_wave, 'pending', (round(cand.dist_m / 50) * 50)::int
  from (
    select hp.user_id,
      extensions.st_distance(hp.last_location, r.meetpoint_geo) as dist_m,
      coalesce(pr.gender, '') as gender,
      (select count(*) from public.dispatch_targets dt2
        where dt2.helper_id = hp.user_id and dt2.pinged_at > now() - interval '2 hours') as recent_pings
    from public.helper_preferences hp
    join public.profiles pr on pr.id = hp.user_id
    where hp.user_id <> r.seeker_id
      and pr.verified = true
      and hp.last_location is not null
      and (v_loc_age is null or hp.location_updated_at > now() - make_interval(mins => v_loc_age))
      and r.category_id = any (hp.categories)
      and extensions.st_dwithin(hp.last_location, r.meetpoint_geo, v_radius_m)
      and extensions.st_dwithin(hp.last_location, r.meetpoint_geo, hp.radius_max_m)
      and not exists (select 1 from public.dispatch_targets dt
                       where dt.request_id = p_request_id and dt.helper_id = hp.user_id)
      and not exists (select 1 from public.blocks b
                       where (b.blocker_id = r.seeker_id and b.blocked_id = hp.user_id)
                          or (b.blocker_id = hp.user_id and b.blocked_id = r.seeker_id))
      and not exists (select 1 from public.matches m
                       where m.helper_id = hp.user_id
                         and m.status in ('confirmed', 'on_the_way', 'arrived'))
      and not public.in_quiet_hours(hp.quiet_hours)
      -- soft daily ping cap (SOS exempt, PRD 3.8)
      and (r.urgency = 'sos' or v_cap is null or (
        select count(*) from public.dispatch_targets dtc
        where dtc.helper_id = hp.user_id and dtc.pinged_at >= date_trunc('day', now())
      ) < v_cap)
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
-- 4. dispatch_tick: identical to the Phase-4 version EXCEPT the lapse sweep
--    skips online matches — an online session may start much later than 10
--    minutes after confirm (e.g. an evening call), and there is no "travel"
--    to lapse on.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record; v_interval jsonb; v_wait int; v_lapse int; v_auto int; v_fallback int;
begin
  select value into v_interval from public.dispatch_config where key = 'wave_interval_minutes';
  select (value)::int into v_lapse    from public.dispatch_config where key = 'match_lapse_minutes';
  select (value)::int into v_auto     from public.dispatch_config where key = 'auto_confirm_minutes';
  select (value)::int into v_fallback from public.dispatch_config where key = 'directed_fallback_minutes';

  update public.requests
  set status = 'expired'
  where status = 'open' and expires_at is not null and expires_at < now();

  -- Auto-confirm: helper marked done, seeker never confirmed.
  for rec in
    select id, request_id from public.matches
    where helper_done_at is not null and completed_at is null
      and helper_done_at < now() - make_interval(mins => coalesce(v_auto, 60))
  loop
    update public.matches set status = 'completed', auto_confirmed = true, completed_at = now() where id = rec.id;
    update public.requests set status = 'completed' where id = rec.request_id;
    update public.chats set closed_at = now()
      where request_id = rec.request_id and kind = 'active' and closed_at is null;
  end loop;

  -- Lapse: one-to-one IN-PERSON confirmed with no "on my way" in the window →
  -- re-broadcast. Online matches are exempt (see header).
  for rec in
    select m.id, m.request_id, m.helper_id
    from public.matches m
    join public.requests r on r.id = m.request_id
    where m.status = 'confirmed'
      and r.interaction_type <> 'group'
      and not r.is_online
      and m.confirmed_at < now() - make_interval(mins => coalesce(v_lapse, 10))
  loop
    update public.matches set status = 'cancelled' where id = rec.id;
    update public.request_responses set status = 'withdrawn', updated_at = now()
      where request_id = rec.request_id and helper_id = rec.helper_id;
    update public.chats set closed_at = now()
      where request_id = rec.request_id and kind = 'active' and closed_at is null;
    update public.requests
      set status = 'open', expires_at = greatest(expires_at, now() + interval '30 minutes')
      where id = rec.request_id;
    perform public.dispatch_wave(rec.request_id);
  end loop;

  -- Directed fallback: the named person hasn't responded in the window → open
  -- up. Ping other eligible connections; if none, go straight to strangers.
  for rec in
    select r.id
    from public.requests r
    where r.status = 'open'
      and r.is_directed
      and r.opened_at is null
      and (r.expires_at is null or r.expires_at > now())
      and not exists (
        select 1 from public.request_responses rr
        where rr.request_id = r.id and rr.status in ('raised', 'confirmed'))
      and exists (
        select 1 from public.dispatch_targets dt
        where dt.request_id = r.id
          and dt.pinged_at < now() - make_interval(mins => coalesce(v_fallback, 5)))
  loop
    update public.requests set opened_at = now() where id = rec.id;
    if public.dispatch_connections(rec.id) = 0 then
      perform public.dispatch_wave(rec.id);
    end if;
  end loop;

  -- Widen waves for open requests with no raised hand, past their interval.
  -- Skip directed requests still waiting on their named person (opened_at null).
  -- (For online requests dispatch_wave routes to dispatch_online, which only
  --  picks up newly-eligible helpers — e.g. someone whose quiet hours ended.)
  for rec in
    select r.id, r.urgency,
           (select max(pinged_at) from public.dispatch_targets dt where dt.request_id = r.id) as last_ping
    from public.requests r
    where r.status = 'open'
      and (r.expires_at is null or r.expires_at > now())
      and (not r.is_directed or r.opened_at is not null)
      and not exists (
        select 1 from public.request_responses rr
        where rr.request_id = r.id and rr.status in ('raised', 'confirmed'))
  loop
    v_wait := coalesce((v_interval ->> rec.urgency::text)::int, 3);
    if rec.last_ping is null or rec.last_ping < now() - make_interval(mins => v_wait) then
      perform public.dispatch_wave(rec.id);
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. helper_start_online: the online replacement for on-my-way/arrived.
--    Reuses status 'arrived' (= "session started") so the existing mark-done,
--    auto-confirm, and mid-help exclusion logic all just work.
-- ----------------------------------------------------------------------------
create or replace function public.helper_start_online(p_match_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); m public.matches%rowtype; v_online boolean;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.helper_id <> v_me or m.status <> 'confirmed' then
    raise exception 'cannot start this help session';
  end if;
  select is_online into v_online from public.requests where id = m.request_id;
  if not coalesce(v_online, false) then
    raise exception 'not an online request';
  end if;
  update public.matches set status = 'arrived' where id = p_match_id;
  update public.requests set status = 'active' where id = m.request_id;
end; $$;

grant execute on function public.helper_start_online(uuid) to authenticated;
revoke all on function public.helper_start_online(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- 6. Views: expose is_online (appended at the END → CREATE OR REPLACE is safe).
-- ----------------------------------------------------------------------------
create or replace view public.helper_pings with (security_invoker = off) as
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
    r.prefer_women,
    r.is_directed,
    (r.is_directed and r.directed_to = (select auth.uid())) as directed_to_me,
    case when r.is_directed and r.directed_to = (select auth.uid())
         then sp.display_name else null end as from_name,
    case when r.is_directed and r.directed_to = (select auth.uid())
         then sp.display_photo_url else null end as from_photo,
    r.is_online
  from public.dispatch_targets dt
  join public.requests r   on r.id = dt.request_id
  join public.categories c on c.id = r.category_id
  join public.profiles sp  on sp.id = r.seeker_id
  where dt.helper_id = (select auth.uid());

create or replace view public.match_details with (security_invoker = off) as
  select
    m.id, m.request_id, m.helper_id, m.seeker_id, m.status, m.meetup_code,
    m.confirmed_at, m.helper_done_at, m.seeker_confirmed_at, m.completed_at,
    r.meetpoint_lat, r.meetpoint_lng, r.approx_area, r.description,
    r.category_id, c.label as category_label, c.icon as category_icon, r.urgency,
    r.interaction_type, r.participant_cap,
    (case when (select auth.uid()) = m.helper_id then m.seeker_id else m.helper_id end) as other_id,
    op.display_name as other_name, op.display_photo_url as other_photo,
    op.celestial_stage as other_stage, op.trust_rating_avg as other_trust,
    case when hp.last_location is null then null
         else round(extensions.st_distance(hp.last_location, r.meetpoint_geo))::int end as helper_distance_m,
    r.is_online
  from public.matches m
  join public.requests r   on r.id = m.request_id
  join public.categories c on c.id = r.category_id
  join public.profiles op
    on op.id = (case when (select auth.uid()) = m.helper_id then m.seeker_id else m.helper_id end)
  left join public.helper_preferences hp on hp.user_id = m.helper_id
  where (select auth.uid()) in (m.helper_id, m.seeker_id);
