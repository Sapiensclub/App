-- ============================================================================
-- SAPIENS — Phase 2, Chunk 5: meeting & completion (PRD 0.7 / 0.8 / 10.10)
-- ============================================================================
-- The live status ladder (accepted → on the way → arrived) and the honest
-- completion model: helper marks done → seeker confirms, OR it auto-confirms
-- after a window so an honest helper is never stranded by a silent seeker.
-- Moneta + ratings are Phase 3; here we only move statuses and close the chat.
-- ============================================================================

-- Tunables
insert into public.dispatch_config (key, value) values
  ('match_lapse_minutes', '10'::jsonb),   -- no "on my way" in this long → lapse + re-broadcast (PRD 0.7)
  ('auto_confirm_minutes', '60'::jsonb)    -- helper marked done, seeker silent this long → auto-confirm (PRD 0.8)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- match_details: also expose the helper's live distance to the meetpoint so
-- the seeker sees text/ETA ("~400 m away · ~6 min") — never a live dot,
-- never coordinates (PRD 10.10).
-- ----------------------------------------------------------------------------
create or replace view public.match_details with (security_invoker = off) as
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
    op.trust_rating_avg   as other_trust,
    case
      when hp.last_location is null then null
      else round(extensions.st_distance(hp.last_location, r.meetpoint_geo))::int
    end as helper_distance_m
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
-- Status transitions (each checks the caller is the right party + valid state)
-- ----------------------------------------------------------------------------
create or replace function public.helper_on_my_way(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.helper_id <> v_me or m.status <> 'confirmed' then
    raise exception 'cannot start travel for this match';
  end if;
  update public.matches set status = 'on_the_way' where id = p_match_id;
  update public.requests set status = 'active' where id = m.request_id;
end; $$;

create or replace function public.helper_arrived(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.helper_id <> v_me or m.status <> 'on_the_way' then
    raise exception 'cannot mark arrived for this match';
  end if;
  update public.matches set status = 'arrived' where id = p_match_id;
end; $$;

-- Helper marks the help done. The meetup code already proves they met, so
-- completion can't begin without a real meeting (PRD 0.8).
create or replace function public.helper_mark_done(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.helper_id <> v_me or m.status not in ('on_the_way', 'arrived') then
    raise exception 'cannot mark done for this match';
  end if;
  update public.matches set helper_done_at = now(), status = 'arrived' where id = p_match_id;
end; $$;

-- Seeker confirms completion → chat dissolves (PRD 4.2), request completed.
create or replace function public.seeker_confirm_done(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.seeker_id <> v_me or m.helper_done_at is null or m.completed_at is not null then
    raise exception 'nothing to confirm for this match';
  end if;
  update public.matches
    set status = 'completed', seeker_confirmed_at = now(), completed_at = now()
    where id = p_match_id;
  update public.requests set status = 'completed' where id = m.request_id;
  update public.chats set closed_at = now()
    where request_id = m.request_id and kind = 'active' and closed_at is null;
end; $$;

grant execute on function public.helper_on_my_way(uuid)   to authenticated;
grant execute on function public.helper_arrived(uuid)     to authenticated;
grant execute on function public.helper_mark_done(uuid)   to authenticated;
grant execute on function public.seeker_confirm_done(uuid) to authenticated;
revoke all on function public.helper_on_my_way(uuid)   from public, anon;
revoke all on function public.helper_arrived(uuid)     from public, anon;
revoke all on function public.helper_mark_done(uuid)   from public, anon;
revoke all on function public.seeker_confirm_done(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- dispatch_tick: add lapse (no "on my way" → re-broadcast, PRD 0.7) and
-- auto-confirm (helper done, seeker silent → auto-confirm, PRD 0.8).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec        record;
  v_interval jsonb;
  v_wait     int;
  v_lapse    int;
  v_auto     int;
begin
  select value into v_interval from public.dispatch_config where key = 'wave_interval_minutes';
  select (value)::int into v_lapse from public.dispatch_config where key = 'match_lapse_minutes';
  select (value)::int into v_auto  from public.dispatch_config where key = 'auto_confirm_minutes';

  -- Expire past-expiry open requests.
  update public.requests
  set status = 'expired'
  where status = 'open' and expires_at is not null and expires_at < now();

  -- Auto-confirm: helper marked done, seeker never confirmed → auto-confirm.
  for rec in
    select id, request_id from public.matches
    where helper_done_at is not null and completed_at is null
      and helper_done_at < now() - make_interval(mins => coalesce(v_auto, 60))
  loop
    update public.matches
      set status = 'completed', auto_confirmed = true, completed_at = now()
      where id = rec.id;
    update public.requests set status = 'completed' where id = rec.request_id;
    update public.chats set closed_at = now()
      where request_id = rec.request_id and kind = 'active' and closed_at is null;
  end loop;

  -- Lapse: confirmed but no "on my way" within the window → silent re-broadcast.
  for rec in
    select id, request_id, helper_id from public.matches
    where status = 'confirmed'
      and confirmed_at < now() - make_interval(mins => coalesce(v_lapse, 10))
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
