-- ============================================================================
-- SAPIENS — Phase 8, Chunk 3: data lifecycle + notification budgets
-- ============================================================================
-- Background hygiene so the app stays clean and calm:
--   1. notify() — one write path for notifications, with per-type daily CAPS and
--      unread DEDUP so the bell never spams (PRD 3.8/5.8). The five notification
--      triggers now route through it.
--   2. retention_sweep() — purges active-request chat messages after they close
--      + a window (PRD 4.3; inbox conversations are permanent and never swept),
--      old read notifications, resolved SOS, and resolved reports. Evidence for
--      still-open reports is preserved. Scheduled daily via pg_cron.
-- ============================================================================

insert into public.dispatch_config (key, value) values
  ('notification_caps', '{"hand_raised":6,"you_were_confirmed":12,"help_completed":20,"new_connection":10,"connection_milestone":20,"moment_pending":10}'::jsonb),
  ('chat_retention_days',         '60'::jsonb),
  ('notification_retention_days', '30'::jsonb),
  ('sos_retention_days',          '90'::jsonb),
  ('report_retention_days',       '365'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- notify(): the single notification writer. Skips if an UNREAD notification of
-- the same type + dedup key already exists, and enforces a per-type daily cap.
-- ----------------------------------------------------------------------------
create or replace function public.notify(
  p_user uuid, p_type text, p_payload jsonb, p_dedup text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_caps jsonb; v_cap int; v_today int;
begin
  if p_user is null then return; end if;

  -- Dedup: collapse repeats (e.g. many hands raised on one request).
  if p_dedup is not null and exists (
    select 1 from public.notifications
    where user_id = p_user and type = p_type and read = false
      and payload ->> 'dedup' = p_dedup
  ) then
    return;
  end if;

  -- Per-type daily cap (a safety net against floods).
  select value into v_caps from public.dispatch_config where key = 'notification_caps';
  v_cap := (v_caps ->> p_type)::int;
  if v_cap is not null then
    select count(*) into v_today from public.notifications
      where user_id = p_user and type = p_type and created_at >= date_trunc('day', now());
    if v_today >= v_cap then return; end if;
  end if;

  insert into public.notifications (user_id, type, payload)
    values (p_user, p_type,
      case when p_dedup is null then p_payload
           else p_payload || jsonb_build_object('dedup', p_dedup) end);
end; $$;

-- ----------------------------------------------------------------------------
-- Route the five notification triggers through notify() (with dedup keys).
-- ----------------------------------------------------------------------------
create or replace function public.notify_hand_raised()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seeker uuid; v_cat text;
begin
  select r.seeker_id, c.label into v_seeker, v_cat
  from public.requests r join public.categories c on c.id = r.category_id
  where r.id = new.request_id;
  perform public.notify(v_seeker, 'hand_raised',
    jsonb_build_object('request_id', new.request_id, 'category', v_cat),
    new.request_id::text);
  return new;
end; $$;

create or replace function public.notify_match_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seeker_name text;
begin
  select display_name into v_seeker_name from public.profiles where id = new.seeker_id;
  perform public.notify(new.helper_id, 'you_were_confirmed',
    jsonb_build_object('request_id', new.request_id, 'match_id', new.id, 'other_name', v_seeker_name),
    new.id::text);
  return new;
end; $$;

create or replace function public.notify_match_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_helper_name text; v_seeker_name text;
begin
  select display_name into v_helper_name from public.profiles where id = new.helper_id;
  select display_name into v_seeker_name from public.profiles where id = new.seeker_id;
  perform public.notify(new.helper_id, 'help_completed',
    jsonb_build_object('request_id', new.request_id, 'other_name', v_seeker_name), new.id::text);
  perform public.notify(new.seeker_id, 'help_completed',
    jsonb_build_object('request_id', new.request_id, 'other_name', v_helper_name), new.id::text);
  return new;
end; $$;

create or replace function public.notify_connection_active()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_a text; v_b text;
begin
  select display_name into v_a from public.profiles where id = new.user_a;
  select display_name into v_b from public.profiles where id = new.user_b;
  perform public.notify(new.user_a, 'new_connection',
    jsonb_build_object('other_id', new.user_b, 'other_name', v_b), new.id::text);
  perform public.notify(new.user_b, 'new_connection',
    jsonb_build_object('other_id', new.user_a, 'other_name', v_a), new.id::text);
  return new;
end; $$;

create or replace function public.notify_stage_milestone()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; rec record;
begin
  select display_name into v_name from public.profiles where id = new.id;
  for rec in
    select case when c.user_a = new.id then c.user_b else c.user_a end as other
    from public.connections c
    where c.status = 'active' and new.id in (c.user_a, c.user_b)
  loop
    perform public.notify(rec.other, 'connection_milestone',
      jsonb_build_object('other_id', new.id, 'other_name', v_name, 'stage', new.celestial_stage::text),
      new.id::text || ':' || new.celestial_stage::text);
  end loop;
  return new;
end; $$;

-- ----------------------------------------------------------------------------
-- retention_sweep(): the daily purge. Owner (definer) so it bypasses RLS.
-- ----------------------------------------------------------------------------
create or replace function public.retention_sweep()
returns void
language plpgsql security definer set search_path = '' as $$
declare v_chat int; v_notif int; v_sos int; v_rep int;
begin
  select (value)::int into v_chat  from public.dispatch_config where key = 'chat_retention_days';
  select (value)::int into v_notif from public.dispatch_config where key = 'notification_retention_days';
  select (value)::int into v_sos   from public.dispatch_config where key = 'sos_retention_days';
  select (value)::int into v_rep   from public.dispatch_config where key = 'report_retention_days';

  -- Active-request chat messages, after the chat closed + window (PRD 4.3).
  -- Inbox chats are permanent. Evidence for unresolved reports is preserved.
  delete from public.messages m
    using public.chats c
    where m.chat_id = c.id
      and c.kind = 'active'
      and c.closed_at is not null
      and c.closed_at < now() - make_interval(days => coalesce(v_chat, 60))
      and not exists (
        select 1 from public.reports r
        where r.evidence_chat_id = c.id and r.status in ('open', 'reviewing'));

  delete from public.notifications
    where read = true and created_at < now() - make_interval(days => coalesce(v_notif, 30));

  delete from public.sos_events
    where resolved = true and created_at < now() - make_interval(days => coalesce(v_sos, 90));

  delete from public.reports
    where status in ('actioned', 'dismissed')
      and created_at < now() - make_interval(days => coalesce(v_rep, 365));
end; $$;

grant execute on function public.retention_sweep() to service_role;

-- ----------------------------------------------------------------------------
-- Schedule the sweep daily (best-effort; pg_cron may need enabling).
-- ----------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'sapiens-retention-sweep') then
    perform cron.unschedule('sapiens-retention-sweep');
  end if;
  perform cron.schedule('sapiens-retention-sweep', '17 3 * * *', 'select public.retention_sweep();');
exception when others then
  raise notice 'pg_cron not scheduled (%). Enable it in the dashboard, or run retention_sweep() manually.', sqlerrm;
end;
$$;
