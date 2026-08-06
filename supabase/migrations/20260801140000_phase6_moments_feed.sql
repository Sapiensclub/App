-- ============================================================================
-- SAPIENS — Phase 6, Chunk 2: the community Moments feed (PRD Bucket 8)
-- ============================================================================
-- The finite, calm celebration surface. Content:
--   · 'help'      — an anonymous "a help happened in <area>" tile (auto).
--   · 'milestone' — "<first name> reached <stage>" (auto, on stage upgrade).
--   · 'selfie'    — double-opt-in shared photos (added in Chunk 3).
--
-- Anti-attention-farming (constitution): the feed is finite, has a bottom, and
-- exposes NO ids (no tap-to-profile) and NO appreciation counts. moments_feed
-- is a SECURITY DEFINER view exposing only safe columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A completed help → one anonymous 'help' moment (deduped per request).
-- ----------------------------------------------------------------------------
create or replace function public.moment_on_help_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_area text; v_cat text;
begin
  if exists (select 1 from public.moments where request_id = new.request_id and type = 'help') then
    return new;
  end if;
  select r.approx_area, c.label into v_area, v_cat
  from public.requests r
  join public.categories c on c.id = r.category_id
  where r.id = new.request_id;

  insert into public.moments (type, request_id, participants, caption, area, visible)
    values ('help', new.request_id, array[new.helper_id, new.seeker_id], v_cat, v_area, true);
  return new;
end; $$;

create trigger matches_moment_completed
  after update on public.matches
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.moment_on_help_completed();

-- ----------------------------------------------------------------------------
-- 2. A stage upgrade → a 'milestone' moment (first name + stage, no area gate).
-- ----------------------------------------------------------------------------
create or replace function public.moment_on_stage_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.moments (type, participants, caption, visible)
    values ('milestone', array[new.id], new.celestial_stage::text, true);
  return new;
end; $$;

create trigger profiles_moment_milestone
  after update on public.profiles
  for each row when (new.celestial_stage > old.celestial_stage)
  execute function public.moment_on_stage_up();

-- ----------------------------------------------------------------------------
-- 3. moments_feed: the safe, finite feed. First names only (never ids), so the
--    feed can celebrate people without enabling profile-surfing. Also reports
--    whether the caller already appreciated each moment (count stays hidden).
-- ----------------------------------------------------------------------------
create view public.moments_feed with (security_invoker = off) as
  select
    m.id,
    m.type,
    m.caption,
    m.area,
    m.photo_url,
    m.created_at,
    (select array_agg(p.display_name)
       from public.profiles p where p.id = any (m.participants)) as participant_names,
    ((select auth.uid()) = any (m.participants)) as mine,
    exists (
      select 1 from public.appreciations a
      where a.moment_id = m.id and a.user_id = (select auth.uid())
    ) as i_appreciated
  from public.moments m
  where m.visible = true and m.removed_by is null
  order by m.created_at desc
  limit 100;

revoke all on public.moments_feed from anon;
grant select on public.moments_feed to authenticated;

alter publication supabase_realtime add table public.moments;
alter publication supabase_realtime add table public.appreciations;
