-- ============================================================================
-- SAPIENS — Phase 6, Chunk 1: the notifications bell (PRD 10.12)
-- ============================================================================
-- The in-app notification inbox. Writers are DB triggers on the events that
-- matter, so we never touch the core dispatch / connection RPCs. This is also
-- the home for milestone notifications (PRD 5.8), deferred here from Phase 4.
--
-- Push-to-lockscreen (Expo Push) needs a dev build (Expo Go can't receive push)
-- and is a Phase 8 task; this chunk builds the surface + the data. The
-- notifications table + RLS already exist (Phase 0). Per-type budgets/caps
-- (PRD 3.8/5.8/6.11) are a Phase 8 hardening item.
-- ============================================================================

-- Bell badge updates live.
alter publication supabase_realtime add table public.notifications;

-- ----------------------------------------------------------------------------
-- 1. A hand is raised on your request → notify the seeker (no helper identity
--    pre-confirm — staged disclosure holds).
-- ----------------------------------------------------------------------------
create or replace function public.notify_hand_raised()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seeker uuid; v_cat text;
begin
  select r.seeker_id, c.label into v_seeker, v_cat
  from public.requests r
  join public.categories c on c.id = r.category_id
  where r.id = new.request_id;

  if v_seeker is not null then
    insert into public.notifications (user_id, type, payload)
      values (v_seeker, 'hand_raised',
        jsonb_build_object('request_id', new.request_id, 'category', v_cat));
  end if;
  return new;
end; $$;

create trigger request_responses_notify_raise
  after insert on public.request_responses
  for each row when (new.status = 'raised')
  execute function public.notify_hand_raised();

-- ----------------------------------------------------------------------------
-- 2. You were confirmed → notify the helper (they can see the seeker now).
-- ----------------------------------------------------------------------------
create or replace function public.notify_match_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seeker_name text;
begin
  select display_name into v_seeker_name from public.profiles where id = new.seeker_id;
  insert into public.notifications (user_id, type, payload)
    values (new.helper_id, 'you_were_confirmed',
      jsonb_build_object('request_id', new.request_id, 'match_id', new.id, 'other_name', v_seeker_name));
  return new;
end; $$;

create trigger matches_notify_created
  after insert on public.matches
  for each row
  execute function public.notify_match_created();

-- ----------------------------------------------------------------------------
-- 3. Help completed → notify both parties (each with the other's name).
-- ----------------------------------------------------------------------------
create or replace function public.notify_match_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_helper_name text; v_seeker_name text;
begin
  select display_name into v_helper_name from public.profiles where id = new.helper_id;
  select display_name into v_seeker_name from public.profiles where id = new.seeker_id;
  insert into public.notifications (user_id, type, payload) values
    (new.helper_id, 'help_completed',
      jsonb_build_object('request_id', new.request_id, 'other_name', v_seeker_name)),
    (new.seeker_id, 'help_completed',
      jsonb_build_object('request_id', new.request_id, 'other_name', v_helper_name));
  return new;
end; $$;

create trigger matches_notify_completed
  after update on public.matches
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.notify_match_completed();

-- ----------------------------------------------------------------------------
-- 4. A connection turns active → notify both (each with the other's name).
-- ----------------------------------------------------------------------------
create or replace function public.notify_connection_active()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_a text; v_b text;
begin
  select display_name into v_a from public.profiles where id = new.user_a;
  select display_name into v_b from public.profiles where id = new.user_b;
  insert into public.notifications (user_id, type, payload) values
    (new.user_a, 'new_connection', jsonb_build_object('other_id', new.user_b, 'other_name', v_b)),
    (new.user_b, 'new_connection', jsonb_build_object('other_id', new.user_a, 'other_name', v_a));
  return new;
end; $$;

create trigger connections_notify_active
  after update on public.connections
  for each row when (new.status = 'active' and old.status is distinct from 'active')
  execute function public.notify_connection_active();

-- ----------------------------------------------------------------------------
-- 5. A connection reaches a new celestial stage → notify their connections
--    (PRD 5.8). Enum compares by declaration order, so this fires only on an
--    UPGRADE — never on a dev reset back to new_moon.
-- ----------------------------------------------------------------------------
create or replace function public.notify_stage_milestone()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select display_name into v_name from public.profiles where id = new.id;
  insert into public.notifications (user_id, type, payload)
    select
      case when c.user_a = new.id then c.user_b else c.user_a end,
      'connection_milestone',
      jsonb_build_object('other_id', new.id, 'other_name', v_name, 'stage', new.celestial_stage::text)
    from public.connections c
    where c.status = 'active' and new.id in (c.user_a, c.user_b);
  return new;
end; $$;

create trigger profiles_notify_milestone
  after update on public.profiles
  for each row when (new.celestial_stage > old.celestial_stage)
  execute function public.notify_stage_milestone();
