-- ============================================================================
-- SAPIENS — T1: push notifications, send side (spec §6; pre-testing chunk)
-- ============================================================================
-- Turns the three "something happened for you" moments into lockscreen pushes:
--
--   dispatch_targets INSERT  → "Someone nearby needs a hand" (the ping — the
--                              moment that matters most; without push a helper
--                              only ever sees it with the app open)
--   notifications INSERT     → mirrors the in-app bell copy
--   messages INSERT          → chat messages to the other participants
--
-- Mechanism: AFTER INSERT triggers call push_enqueue(), which fire-and-forgets
-- an HTTP POST (pg_net, async worker) to the push-send Edge Function. The
-- function (service role) resolves recipients + safe copy and talks to the
-- Expo Push API. Trust between DB and function = shared secret header.
--
-- SAFE-BY-DEFAULT: until BOTH config keys below exist, push_enqueue no-ops —
-- so this migration can land before the function is deployed.
--
-- One-time setup AFTER deploying the function (SQL editor, fill both values):
--   insert into public.dispatch_config (key, value) values
--     ('push_fn_url',    to_jsonb('https://<PROJECT-REF>.supabase.co/functions/v1/push-send'::text)),
--     ('push_fn_secret', to_jsonb('<RANDOM-SECRET>'::text))
--   on conflict (key) do update set value = excluded.value;
-- (The same <RANDOM-SECRET> must be set as the function's PUSH_WEBHOOK_SECRET.)
-- ============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- push_enqueue: fire-and-forget POST to the push-send function. SECURITY
-- DEFINER because net.http_post isn't granted to app roles, and the triggers
-- run in the inserting user's context. A push failure must NEVER break the
-- write that caused it — hence the blanket exception guard.
-- ----------------------------------------------------------------------------
create or replace function public.push_enqueue(p_payload jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  select value #>> '{}' into v_url    from public.dispatch_config where key = 'push_fn_url';
  select value #>> '{}' into v_secret from public.dispatch_config where key = 'push_fn_secret';
  if v_url is null or v_secret is null then
    return; -- push not configured yet → silently off
  end if;
  perform net.http_post(
    url := v_url,
    body := p_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret),
    timeout_milliseconds := 5000);
exception when others then
  null; -- never let push plumbing fail the actual insert
end; $$;

revoke all on function public.push_enqueue(jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The three thin triggers. They forward only (source, id); the Edge Function
-- re-reads rows with the service role — no payload trusting, and all copy
-- stays in one place.
-- ----------------------------------------------------------------------------
create or replace function public.push_on_dispatch_target()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_enqueue(jsonb_build_object('source', 'ping', 'id', new.id));
  return new;
end; $$;

drop trigger if exists push_on_dispatch_target on public.dispatch_targets;
create trigger push_on_dispatch_target
  after insert on public.dispatch_targets
  for each row execute function public.push_on_dispatch_target();

create or replace function public.push_on_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_enqueue(jsonb_build_object('source', 'notification', 'id', new.id));
  return new;
end; $$;

drop trigger if exists push_on_notification on public.notifications;
create trigger push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification();

create or replace function public.push_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_enqueue(jsonb_build_object('source', 'message', 'id', new.id));
  return new;
end; $$;

drop trigger if exists push_on_message on public.messages;
create trigger push_on_message
  after insert on public.messages
  for each row execute function public.push_on_message();
