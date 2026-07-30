-- ============================================================================
-- SAPIENS — Phase 2, Chunk 2: THE DISPATCH ENGINE (spec §5, PRD 3.x)
-- ============================================================================
-- The custom core: geospatial, wave-based, fairness-corrected matching.
--   1. resolve eligible helpers (PostGIS radius + category opt-in + verified +
--      not mid-help + not quiet hours + not blocked + prefer-women)
--   2. order nearest-first, corrected by load-rotation fairness — NEVER badge
--   3. dispatch in waves; widen radius over time; urgency compresses timing
--
-- All functions are SECURITY DEFINER (they read owner-only helper locations and
-- write service-only dispatch_targets). Tunables live in dispatch_config.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Schema additions
-- ----------------------------------------------------------------------------
-- Gender drives prefer-women (PRD 1.4). Real KYC populates it from the ID;
-- nullable until then (mock KYC leaves it null → simply not preferred).
alter table public.profiles
  add column if not exists gender text;

-- ----------------------------------------------------------------------------
-- 1. Engine tunables (data, not code — PRD A12)
-- ----------------------------------------------------------------------------
insert into public.dispatch_config (key, value) values
  ('wave_size',              '{"casual":3,"everyday":4,"urgent":6,"sos":25}'::jsonb),
  ('wave_interval_minutes',  '{"casual":5,"everyday":3,"urgent":1,"sos":0}'::jsonb),
  ('radius_start_m',         '{"casual":2000,"everyday":3000,"urgent":4000,"sos":8000}'::jsonb),
  ('radius_step_m',          '2000'::jsonb),
  ('radius_max_m',           '15000'::jsonb),
  ('fairness_penalty_m',     '300'::jsonb),
  ('location_max_age_minutes','60'::jsonb),
  ('scheduled_lead_minutes', '60'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Quiet-hours check (approx: server UTC hour; real impl uses helper tz)
-- ----------------------------------------------------------------------------
create or replace function public.in_quiet_hours(quiet jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when quiet is null or not coalesce((quiet ->> 'enabled')::boolean, false) then false
    else (
      with h as (select extract(hour from (now() at time zone 'utc'))::int as hr),
           b as (select (quiet ->> 'start')::int as s, (quiet ->> 'end')::int as e)
      select case
        when b.s <= b.e then h.hr >= b.s and h.hr < b.e
        else h.hr >= b.s or h.hr < b.e   -- window wraps midnight
      end
      from h, b
    )
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Dispatch one wave for a request (the heart)
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_wave(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r            public.requests%rowtype;
  v_wave       int;
  v_size       int;
  v_radius_m   double precision;
  v_start      jsonb;
  v_step       double precision;
  v_max        double precision;
  v_penalty    double precision;
  v_loc_age    int;
  v_lead       int;
  v_count      int;
begin
  select * into r from public.requests where id = p_request_id;
  if not found or r.status <> 'open' or r.meetpoint_geo is null then
    return 0;
  end if;

  -- Scheduled requests dispatch leisurely — only near the appointed time.
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

  insert into public.dispatch_targets (request_id, helper_id, wave_number, outcome)
  select p_request_id, cand.user_id, v_wave, 'pending'
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
      -- within the request's growing search radius AND the helper's own cap
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
    -- prefer women first when the seeker asked (soft preference, not a filter)
    case when r.prefer_women and cand.gender = 'female' then 0 else 1 end,
    -- nearest-first, corrected by load-rotation fairness (NEVER by badge)
    (cand.dist_m + cand.recent_pings * v_penalty) asc
  limit v_size;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Ping wave 1 the moment a "now" request is created
-- ----------------------------------------------------------------------------
create or replace function public.on_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.dispatch_wave(new.id);
  return new;
end;
$$;

create trigger requests_dispatch_on_create
  after insert on public.requests
  for each row when (new.status = 'open')
  execute function public.on_request_created();

-- ----------------------------------------------------------------------------
-- 5. The scheduled tick (~1 min): widen/next-wave + expire (PRD 3.2/3.10)
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec       record;
  v_interval jsonb;
  v_wait    int;
begin
  select value into v_interval from public.dispatch_config where key = 'wave_interval_minutes';

  -- Requests past their expiry with no match → expired (PRD 3.10).
  update public.requests
  set status = 'expired'
  where status = 'open' and expires_at is not null and expires_at < now();

  -- Open requests with no raised hand, past their wave interval → widen + ping.
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

-- The tick may be called by the service role (test harness) or pg_cron.
grant execute on function public.dispatch_tick() to service_role;

-- Service-role-only back-office helper: set a given helper's location. Used by
-- the seeded-data test harness and future admin tooling. Never exposed to
-- clients (users set their own via update_my_location).
create or replace function public.admin_set_helper_location(
  p_user uuid, p_lat double precision, p_lng double precision)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.helper_preferences
  set last_location = extensions.st_setsrid(
        extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      location_updated_at = now()
  where user_id = p_user;
$$;

revoke all on function public.admin_set_helper_location(uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.admin_set_helper_location(uuid, double precision, double precision)
  to service_role;

-- ----------------------------------------------------------------------------
-- 6. Realtime — helpers see their pings live (RLS still applies per subscriber)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.dispatch_targets;
alter publication supabase_realtime add table public.request_responses;

-- ----------------------------------------------------------------------------
-- 7. Automatic tick via pg_cron (best-effort; harness/manual works regardless)
-- ----------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'sapiens-dispatch-tick') then
    perform cron.unschedule('sapiens-dispatch-tick');
  end if;
  perform cron.schedule('sapiens-dispatch-tick', '* * * * *', 'select public.dispatch_tick();');
exception when others then
  raise notice 'pg_cron not scheduled (%). Enable it in the dashboard, or the tick can run manually.', sqlerrm;
end;
$$;
