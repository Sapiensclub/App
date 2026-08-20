-- ============================================================================
-- SAPIENS — quiet hours: timezone-aware (bug found in testing, 2026-08-20)
-- ============================================================================
-- in_quiet_hours() compared against the SERVER's UTC hour, so an Indian
-- member's 22:00–06:00 quiet window actually silenced them 03:30–11:30 IST —
-- helpers were invisible all morning (this hid the iPhone tester from an
-- 11 AM request).
--
-- Fix: the app now saves a 'tz' key inside quiet_hours (minutes east of UTC,
-- IST = 330) and the check computes the member's LOCAL hour. Same 1-argument
-- signature → dispatch_wave / dispatch_online / dispatch_connections need no
-- changes. Missing 'tz' defaults to 330: India-first product, and every row
-- saved before this fix came from an IST tester.

create or replace function public.in_quiet_hours(quiet jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when quiet is null or not coalesce((quiet ->> 'enabled')::boolean, false) then false
    else (
      with h as (select extract(hour from (now() at time zone 'utc'
                   + make_interval(mins => coalesce((quiet ->> 'tz')::int, 330))))::int as hr),
           b as (select (quiet ->> 'start')::int as s, (quiet ->> 'end')::int as e)
      select case
        when b.s <= b.e then h.hr >= b.s and h.hr < b.e
        else h.hr >= b.s or h.hr < b.e   -- window wraps midnight
      end
      from h, b
    )
  end;
$$;

-- Stamp existing quiet-hours rows with IST so the default never has to guess.
update public.helper_preferences
  set quiet_hours = quiet_hours || '{"tz": 330}'::jsonb
  where quiet_hours is not null
    and not (quiet_hours ? 'tz');
