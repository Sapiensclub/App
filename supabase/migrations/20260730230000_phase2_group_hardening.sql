-- ============================================================================
-- SAPIENS — Phase 2, Chunk 6: group requests + hardening
-- ============================================================================
-- 1. Notification daily cap (survival mechanic, PRD 3.8) in dispatch_wave
-- 2. Group scheduled requests: multi-accept up to cap + a shared group chat
--    (PRD 4.7) — confirm_helper made group-aware
-- 3. group_end (seeker ends the group activity) + retry_request (dead-request
--    path, PRD 3.10)
-- ============================================================================

insert into public.dispatch_config (key, value) values
  ('daily_ping_cap', '20'::jsonb)          -- soft cap on pings/helper/day; SOS exempt
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- match_details: also expose interaction_type + participant_cap so the app
-- can tell a group match from a one-to-one one.
-- ----------------------------------------------------------------------------
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
         else round(extensions.st_distance(hp.last_location, r.meetpoint_geo))::int end as helper_distance_m
  from public.matches m
  join public.requests r   on r.id = m.request_id
  join public.categories c on c.id = r.category_id
  join public.profiles op
    on op.id = (case when (select auth.uid()) = m.helper_id then m.seeker_id else m.helper_id end)
  left join public.helper_preferences hp on hp.user_id = m.helper_id
  where (select auth.uid()) in (m.helper_id, m.seeker_id);

revoke all on public.match_details from anon;
grant select on public.match_details to authenticated;

-- ----------------------------------------------------------------------------
-- dispatch_wave: add the daily-ping cap (SOS exempt). Body otherwise unchanged.
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
-- confirm_helper: group-aware. One-to-one keeps the old single-match behavior;
-- group adds the helper to a SHARED chat and stays open until the cap is full.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_helper(p_request_id uuid, p_helper_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seeker      uuid := auth.uid();
  v_match_id    uuid;
  v_chat_id     uuid;
  v_code        text;
  v_interaction text;
  v_cap         int;
  v_confirmed   int;
begin
  if v_seeker is null then raise exception 'not authenticated'; end if;

  select interaction_type::text, participant_cap into v_interaction, v_cap
  from public.requests
  where id = p_request_id and seeker_id = v_seeker and status = 'open';
  if not found then raise exception 'request not open or not yours'; end if;

  if not exists (
    select 1 from public.request_responses
    where request_id = p_request_id and helper_id = p_helper_id and status = 'raised'
  ) then
    raise exception 'helper has not raised a hand';
  end if;

  -- Find or create the shared active chat (one per request).
  select id into v_chat_id
  from public.chats where request_id = p_request_id and kind = 'active'
  order by created_at desc limit 1;
  if v_chat_id is null then
    insert into public.chats (kind, request_id) values ('active', p_request_id) returning id into v_chat_id;
    insert into public.chat_participants (chat_id, user_id) values (v_chat_id, v_seeker)
      on conflict do nothing;
  end if;

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.matches (request_id, helper_id, seeker_id, status, meetup_code, confirmed_at)
    values (p_request_id, p_helper_id, v_seeker, 'confirmed', v_code, now())
    returning id into v_match_id;
  insert into public.chat_participants (chat_id, user_id) values (v_chat_id, p_helper_id)
    on conflict do nothing;
  update public.request_responses set status = 'confirmed', updated_at = now()
    where request_id = p_request_id and helper_id = p_helper_id;

  if v_interaction = 'group' then
    -- Multi-accept: keep the request open for more joiners until the cap fills.
    select count(*) into v_confirmed
    from public.matches where request_id = p_request_id and status <> 'cancelled';
    if v_cap is not null and v_confirmed >= v_cap then
      update public.requests set status = 'matched' where id = p_request_id;
      update public.request_responses set status = 'vetoed', updated_at = now()
        where request_id = p_request_id and status = 'raised';
      update public.dispatch_targets set outcome = 'expired'
        where request_id = p_request_id and outcome in ('pending', 'raised');
    end if;
  else
    -- One-to-one: single match; release the others.
    update public.request_responses set status = 'vetoed', updated_at = now()
      where request_id = p_request_id and status = 'raised' and helper_id <> p_helper_id;
    update public.dispatch_targets set outcome = 'expired'
      where request_id = p_request_id and helper_id <> p_helper_id and outcome in ('pending', 'raised');
    update public.requests set status = 'matched' where id = p_request_id;
  end if;

  return v_match_id;
end;
$$;

revoke all on function public.confirm_helper(uuid, uuid) from public, anon;
grant execute on function public.confirm_helper(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- group_end: the seeker ends the group activity → all matches complete.
-- ----------------------------------------------------------------------------
create or replace function public.group_end(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if not exists (select 1 from public.requests where id = p_request_id and seeker_id = v_me) then
    raise exception 'not your request';
  end if;
  update public.matches
    set status = 'completed', seeker_confirmed_at = now(), completed_at = now()
    where request_id = p_request_id and status not in ('completed', 'cancelled');
  update public.requests set status = 'completed' where id = p_request_id;
  update public.chats set closed_at = now()
    where request_id = p_request_id and kind = 'active' and closed_at is null;
end; $$;

grant execute on function public.group_end(uuid) to authenticated;
revoke all on function public.group_end(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- retry_request: the dead-request path — reopen with a fresh window + widen.
-- ----------------------------------------------------------------------------
create or replace function public.retry_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); r public.requests%rowtype;
begin
  select * into r from public.requests where id = p_request_id and seeker_id = v_me;
  if not found then raise exception 'not your request'; end if;
  if r.status not in ('open', 'expired') then raise exception 'cannot retry this request'; end if;
  update public.requests
    set status = 'open', expires_at = now() + interval '30 minutes'
    where id = p_request_id;
  perform public.dispatch_wave(p_request_id);
end; $$;

grant execute on function public.retry_request(uuid) to authenticated;
revoke all on function public.retry_request(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- dispatch_tick: exclude GROUP matches from the "no on-my-way" lapse (group
-- participants never do the solo on-my-way ladder). Otherwise unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record; v_interval jsonb; v_wait int; v_lapse int; v_auto int;
begin
  select value into v_interval from public.dispatch_config where key = 'wave_interval_minutes';
  select (value)::int into v_lapse from public.dispatch_config where key = 'match_lapse_minutes';
  select (value)::int into v_auto  from public.dispatch_config where key = 'auto_confirm_minutes';

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

  -- Widen waves for open requests with no raised hand, past their interval.
  for rec in
    select r.id, r.urgency,
           (select max(pinged_at) from public.dispatch_targets dt where dt.request_id = r.id) as last_ping
    from public.requests r
    where r.status = 'open'
      and (r.expires_at is null or r.expires_at > now())
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
