-- ============================================================================
-- SAPIENS — Phase 5, Chunk 1: the guarded SOS (spec §Phase 5, PRD 10.9)
-- ============================================================================
-- The safety button. Chunk 1 = firing + resolving an SOS event and the one-tap
-- 112 path (the call itself is a device dialer link, so it works even offline).
-- The soft daily limit is ACCOUNTABILITY, never a lock on the button (PRD 10.9):
-- we record the nth-today count and surface it, but always let the press through.
-- Trusted-contact alerting + live-location links come in Chunk 2.
--
-- sos_events + trusted_contacts already exist (Phase 0). Here we add resolved_at,
-- the fire/resolve RPCs, and realtime.
-- ============================================================================

alter table public.sos_events
  add column if not exists resolved_at timestamptz;

-- Soft daily limit — surfaced for accountability, never enforced as a block.
insert into public.dispatch_config (key, value) values
  ('sos_soft_daily_limit', '3'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- fire_sos: record an SOS press. Computes the nth-today count server-side so it
-- can't be spoofed, and reports whether the soft limit is exceeded (the client
-- shows a gentle note — it does NOT block). Returns the new event + counts.
-- ----------------------------------------------------------------------------
create or replace function public.fire_sos(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_count int;
  v_limit int;
  v_id    uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select count(*) + 1 into v_count
  from public.sos_events
  where user_id = v_me and created_at >= date_trunc('day', now());

  select (value)::int into v_limit from public.dispatch_config where key = 'sos_soft_daily_limit';

  insert into public.sos_events (user_id, lat, lng, daily_count)
    values (v_me, p_lat, p_lng, v_count)
    returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'daily_count', v_count,
    'soft_limit', coalesce(v_limit, 3),
    'over_limit', v_count > coalesce(v_limit, 3)
  );
end;
$$;

grant execute on function public.fire_sos(double precision, double precision) to authenticated;
revoke all on function public.fire_sos(double precision, double precision) from public, anon;

-- ----------------------------------------------------------------------------
-- resolve_sos: the "are you safe?" follow-up — the owner marks it resolved.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_sos(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  update public.sos_events
    set resolved = true, resolved_at = now()
    where id = p_id and user_id = v_me;
end;
$$;

grant execute on function public.resolve_sos(uuid) to authenticated;
revoke all on function public.resolve_sos(uuid) from public, anon;

-- The SOS screen watches its own event (e.g. resolved on another device).
alter publication supabase_realtime add table public.sos_events;
