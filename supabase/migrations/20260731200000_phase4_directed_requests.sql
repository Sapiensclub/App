-- ============================================================================
-- SAPIENS — Phase 4, Chunk 3: directed requests + the connections wave
-- ============================================================================
-- Two ways your CONNECTIONS get first claim on helping you:
--
--  1. Directed request ("Ask [name] for help", PRD 5.5): a request aimed at one
--     connection. Only they are pinged, for a short window. If they don't pick
--     it up, it FALLS BACK to normal open dispatch (their chance stays open).
--     Because you already know each other, their ping reveals who is asking.
--
--  2. Connections wave (PRD 5.6): on a NORMAL request, eligible connections are
--     pinged FIRST; strangers follow on the next wave (via the tick) only if no
--     connection raised a hand.
--
-- The requests table already carries is_directed + directed_to (Phase 0 hook).
-- We add opened_at to mark when a directed request has opened up to everyone.
-- ============================================================================

-- Marks the moment a directed request fell back to open dispatch (null = still
-- waiting on the named person only). Drives the seeker's waiting copy.
alter table public.requests
  add column if not exists opened_at timestamptz;

-- How long the named person has before a directed request opens to everyone.
insert into public.dispatch_config (key, value) values
  ('directed_fallback_minutes', '5'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- dispatch_directed: ping ONLY the named connection (wave 1). A personal ask,
-- so it skips the usual category/radius/quiet-hours filters — you chose them.
-- Blocks are still honoured (can't happen between connections, but be safe).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_directed(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests%rowtype;
  v_count int;
begin
  select * into r from public.requests where id = p_request_id;
  if not found or r.status <> 'open' or r.directed_to is null then
    return 0;
  end if;

  insert into public.dispatch_targets (request_id, helper_id, wave_number, outcome, approx_distance_m)
  select
    p_request_id,
    r.directed_to,
    1,
    'pending',
    (select (round(extensions.st_distance(hp.last_location, r.meetpoint_geo) / 50) * 50)::int
       from public.helper_preferences hp
       where hp.user_id = r.directed_to
         and hp.last_location is not null
         and r.meetpoint_geo is not null)
  where not exists (
      select 1 from public.dispatch_targets dt
      where dt.request_id = p_request_id and dt.helper_id = r.directed_to)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = r.seeker_id and b.blocked_id = r.directed_to)
         or (b.blocker_id = r.directed_to and b.blocked_id = r.seeker_id));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- dispatch_connections: ping the seeker's eligible active connections (wave 1),
-- each within THEIR OWN stated reach (radius_max_m) — connections get first
-- claim regardless of the request's starting radius. Same eligibility gates as
-- a normal wave otherwise (verified, category opt-in, not mid-help, not quiet
-- hours, not blocked, daily cap). No size limit — connections are few.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_connections(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests%rowtype;
  v_penalty double precision; v_loc_age int; v_cap int; v_lead int; v_count int;
begin
  select * into r from public.requests where id = p_request_id;
  if not found or r.status <> 'open' or r.meetpoint_geo is null then
    return 0;
  end if;

  -- Scheduled requests wait until near their time, same as dispatch_wave.
  if r.timing = 'scheduled' then
    select (value)::int into v_lead from public.dispatch_config where key = 'scheduled_lead_minutes';
    if r.scheduled_at is null or now() < r.scheduled_at - make_interval(mins => coalesce(v_lead, 60)) then
      return 0;
    end if;
  end if;

  select (value)::double precision into v_penalty from public.dispatch_config where key = 'fairness_penalty_m';
  select (value)::int into v_loc_age from public.dispatch_config where key = 'location_max_age_minutes';
  select (value)::int into v_cap     from public.dispatch_config where key = 'daily_ping_cap';

  insert into public.dispatch_targets (request_id, helper_id, wave_number, outcome, approx_distance_m)
  select p_request_id, cand.user_id, 1, 'pending', (round(cand.dist_m / 50) * 50)::int
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
      -- within the CONNECTION's own reach (not the request's growing radius)
      and extensions.st_dwithin(hp.last_location, r.meetpoint_geo, hp.radius_max_m)
      -- must be an active connection of the seeker
      and exists (
        select 1 from public.connections cn
        where cn.status = 'active'
          and ((cn.user_a = r.seeker_id and cn.user_b = hp.user_id)
            or (cn.user_b = r.seeker_id and cn.user_a = hp.user_id)))
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
    (cand.dist_m + cand.recent_pings * v_penalty) asc;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- on_request_created: directed → ping the named person only; otherwise ping
-- connections first, and fall straight through to strangers if there are none.
-- ----------------------------------------------------------------------------
create or replace function public.on_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_directed and new.directed_to is not null then
    perform public.dispatch_directed(new.id);
  else
    if public.dispatch_connections(new.id) = 0 then
      perform public.dispatch_wave(new.id);
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- dispatch_tick: adds the directed-fallback step, and stops the widen loop from
-- pinging strangers for a directed request that is still waiting on its named
-- person. Everything else (expire, auto-confirm, lapse, widen) is unchanged.
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

  -- Lapse: one-to-one confirmed with no "on my way" in the window → re-broadcast.
  for rec in
    select m.id, m.request_id, m.helper_id
    from public.matches m
    join public.requests r on r.id = m.request_id
    where m.status = 'confirmed'
      and r.interaction_type <> 'group'
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

grant execute on function public.dispatch_tick() to service_role;

-- ----------------------------------------------------------------------------
-- helper_pings: reveal who is asking WHEN the ping is a directed ask aimed at
-- the viewer (they're already connected, so the seeker's identity is known).
-- New columns appended at the end (CREATE OR REPLACE allows append-only).
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
         then sp.display_photo_url else null end as from_photo
  from public.dispatch_targets dt
  join public.requests r   on r.id = dt.request_id
  join public.categories c on c.id = r.category_id
  join public.profiles sp  on sp.id = r.seeker_id
  where dt.helper_id = (select auth.uid());

revoke all on public.helper_pings from anon;
grant select on public.helper_pings to authenticated;
