-- ============================================================================
-- SAPIENS — Phase 7, Chunk 2: suspend / ban enforcement
-- ============================================================================
-- Moderation state on profiles, enforced server-side: a banned or currently
-- suspended member cannot raise a request or offer help, and cannot clear
-- their own restriction. The admin sets state via SECURITY DEFINER RPCs granted
-- to the service role only (the dashboard re-checks the admin allowlist first).
-- ============================================================================

alter table public.profiles
  add column if not exists suspended_until timestamptz,
  add column if not exists banned_at       timestamptz,
  add column if not exists moderation_note  text;

-- Active = not banned and not currently suspended.
create or replace function public.is_active_member(p_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select banned_at is null and (suspended_until is null or suspended_until <= now())
    from public.profiles where id = p_id
  ), false);
$$;

-- ----------------------------------------------------------------------------
-- Self-tamper guard: a normal user (auth.uid() present) may never change their
-- own moderation columns. The admin RPCs run as the service role (auth.uid() is
-- null there), so they are unaffected.
-- ----------------------------------------------------------------------------
create or replace function public.protect_moderation_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.banned_at is distinct from old.banned_at
      or new.suspended_until is distinct from old.suspended_until
      or new.moderation_note is distinct from old.moderation_note)
     and auth.uid() is not null then
    raise exception 'moderation state can only be changed by an admin';
  end if;
  return new;
end; $$;

create trigger profiles_protect_moderation
  before update on public.profiles
  for each row execute function public.protect_moderation_columns();

-- ----------------------------------------------------------------------------
-- Enforcement 1: a restricted member cannot raise a request.
-- ----------------------------------------------------------------------------
create or replace function public.block_restricted_seeker()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member(new.seeker_id) then
    raise exception 'account restricted';
  end if;
  return new;
end; $$;

create trigger requests_block_restricted
  before insert on public.requests
  for each row execute function public.block_restricted_seeker();

-- ----------------------------------------------------------------------------
-- Enforcement 2: a restricted member cannot raise a hand. (raise_hand redefined
-- with the check; body otherwise unchanged from Phase 2.)
-- ----------------------------------------------------------------------------
create or replace function public.raise_hand(p_request_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_helper uuid := auth.uid();
begin
  if v_helper is null then raise exception 'not authenticated'; end if;
  if not public.is_active_member(v_helper) then raise exception 'account restricted'; end if;
  if not exists (
    select 1 from public.dispatch_targets
    where request_id = p_request_id and helper_id = v_helper
  ) then
    raise exception 'not pinged for this request';
  end if;
  if not coalesce((select verified from public.profiles where id = v_helper), false) then
    raise exception 'not verified';
  end if;
  if not exists (select 1 from public.requests where id = p_request_id and status = 'open') then
    raise exception 'request not open';
  end if;

  insert into public.request_responses (request_id, helper_id, status)
    values (p_request_id, v_helper, 'raised')
  on conflict (request_id, helper_id) do update set status = 'raised', updated_at = now();

  update public.dispatch_targets set outcome = 'raised'
    where request_id = p_request_id and helper_id = v_helper;
end;
$$;

-- ----------------------------------------------------------------------------
-- Admin actions — service-role only (dashboard checks the allowlist first).
-- ----------------------------------------------------------------------------
create or replace function public.admin_ban_user(p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
    set banned_at = now(), suspended_until = null, moderation_note = p_note
    where id = p_user;
end; $$;

create or replace function public.admin_suspend_user(p_user uuid, p_days int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
    set suspended_until = now() + make_interval(days => greatest(coalesce(p_days, 1), 1)),
        banned_at = null, moderation_note = p_note
    where id = p_user;
end; $$;

create or replace function public.admin_lift_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
    set suspended_until = null, banned_at = null, moderation_note = null
    where id = p_user;
end; $$;

revoke all on function public.admin_ban_user(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_suspend_user(uuid, int, text) from public, anon, authenticated;
revoke all on function public.admin_lift_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_ban_user(uuid, text) to service_role;
grant execute on function public.admin_suspend_user(uuid, int, text) to service_role;
grant execute on function public.admin_lift_user(uuid) to service_role;
