-- ============================================================================
-- SAPIENS — Phase 2, Chunk 1: request foundation (config, expiry, location)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DISPATCH CONFIG — tunables as DATA, not code (PRD A12/A13)
-- ----------------------------------------------------------------------------
-- Wave sizes, intervals, lifetimes etc. get tuned with real usage; keeping
-- them here means tuning is an UPDATE, not an app release. Engine values are
-- added in Chunk 2; Chunk 1 needs the request lifetimes.
create table public.dispatch_config (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.dispatch_config enable row level security;

-- Harmless to read (no secrets); writable only via service/admin.
create policy "dispatch_config: authenticated read"
  on public.dispatch_config for select
  to authenticated
  using (true);

insert into public.dispatch_config (key, value) values
  -- How long a "Now" request stays open per urgency tier (PRD 3.7 indicative
  -- defaults: casual ~2h · everyday ~1h · urgent ~30m). sos mirrors urgent
  -- until Phase 5 wires the real SOS trigger.
  ('request_lifetime_minutes', '{"casual": 120, "everyday": 60, "urgent": 30, "sos": 30}'::jsonb),
  -- Scheduled requests live until their time + this grace (PRD 3.7).
  ('scheduled_grace_minutes', '30'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. AUTOMATIC EXPIRY — server sets expires_at, one less thing clients decide
-- ----------------------------------------------------------------------------
create or replace function public.set_request_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lifetimes jsonb;
  grace_min integer;
  mins integer;
begin
  if new.expires_at is not null then
    return new; -- caller (service/engine) chose explicitly; respect it
  end if;

  if new.timing = 'now' then
    select value into lifetimes
    from public.dispatch_config where key = 'request_lifetime_minutes';
    mins := coalesce((lifetimes ->> new.urgency::text)::integer, 60);
    new.expires_at := now() + make_interval(mins => mins);
  else
    select (value)::integer into grace_min
    from public.dispatch_config where key = 'scheduled_grace_minutes';
    new.expires_at := new.scheduled_at + make_interval(mins => coalesce(grace_min, 30));
  end if;

  return new;
end;
$$;

create trigger requests_set_expiry
  before insert on public.requests
  for each row execute function public.set_request_expiry();

-- ----------------------------------------------------------------------------
-- 3. HELPER LOCATION — the engine's "who is nearby" input
-- ----------------------------------------------------------------------------
-- Last-known location, updated while the app is in the foreground. Owner-only
-- via helper_preferences' existing RLS; the dispatch engine reads it with the
-- service role. Never exposed to other users — pings carry only a ROUGH
-- distance computed server-side (staged disclosure, PRD 0.4).
alter table public.helper_preferences
  add column if not exists last_location extensions.geography (point, 4326),
  add column if not exists location_updated_at timestamptz;

create index if not exists helper_preferences_location_idx
  on public.helper_preferences using gist (last_location);

-- Small RPC so the client never hand-writes PostGIS literals. Runs as the
-- caller (security invoker): helper_preferences RLS still applies.
create or replace function public.update_my_location(p_lat double precision, p_lng double precision)
returns void
language sql
set search_path = ''
as $$
  update public.helper_preferences
  set last_location = extensions.st_setsrid(
        extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      location_updated_at = now()
  where user_id = auth.uid();
$$;

revoke all on function public.update_my_location(double precision, double precision) from public, anon;
grant execute on function public.update_my_location(double precision, double precision) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. REALTIME — broadcast request changes (RLS still applies per subscriber)
-- ----------------------------------------------------------------------------
-- The seeker's waiting screen subscribes to their own request row. Tables must
-- be added to the realtime publication explicitly.
alter publication supabase_realtime add table public.requests;
