-- ============================================================================
-- SAPIENS — Phase 4, Chunk 1: the Connect offer + connection graph (Bucket 5)
-- ============================================================================
-- A Connection is the only relationship in Sapiens, earned by a real completed
-- help (PRD 5.1). Double opt-in: both must accept (PRD 5.2). Decline is silent
-- (PRD 5.3). The connections table already exists; here we add the two accept
-- flags, the accept/decline RPCs, and a disclosure view for the graph (visible
-- only to the owner + their connections, PRD 5.7).
-- ============================================================================

alter table public.connections
  add column if not exists a_accepted boolean not null default false,
  add column if not exists b_accepted boolean not null default false;

-- ----------------------------------------------------------------------------
-- connect_offer: the caller accepts the Connect offer for a completed help.
-- Creates the offer on first accept; flips to 'active' when both have accepted.
-- ----------------------------------------------------------------------------
create or replace function public.connect_offer(p_match uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  m        public.matches%rowtype;
  v_other  uuid;
  v_a      uuid;
  v_b      uuid;
  v_status text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into m from public.matches
  where id = p_match and status = 'completed' and v_me in (helper_id, seeker_id);
  if not found then raise exception 'no completed help to connect over'; end if;

  v_other := case when v_me = m.helper_id then m.seeker_id else m.helper_id end;
  v_a := least(v_me, v_other);
  v_b := greatest(v_me, v_other);

  insert into public.connections (user_a, user_b, status, formed_from_request, offered_at, a_accepted, b_accepted)
    values (v_a, v_b, 'offered', m.request_id, now(), v_me = v_a, v_me = v_b)
  on conflict (user_a, user_b) do update
    set a_accepted = public.connections.a_accepted or (v_me = v_a),
        b_accepted = public.connections.b_accepted or (v_me = v_b);

  -- Recompute status from the (now-current) flags, unless disconnected.
  update public.connections
    set status = case when a_accepted and b_accepted then 'active' else 'offered' end,
        active_at = case when a_accepted and b_accepted and active_at is null then now() else active_at end
    where user_a = v_a and user_b = v_b and status <> 'disconnected'
    returning status into v_status;

  return v_status;
end;
$$;

grant execute on function public.connect_offer(uuid) to authenticated;
revoke all on function public.connect_offer(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- connect_decline: silently decline (PRD 5.3 — the other is never told).
-- ----------------------------------------------------------------------------
create or replace function public.connect_decline(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  m public.matches%rowtype;
  v_other uuid; v_a uuid; v_b uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into m from public.matches where id = p_match and v_me in (helper_id, seeker_id);
  if not found then raise exception 'not your match'; end if;
  v_other := case when v_me = m.helper_id then m.seeker_id else m.helper_id end;
  v_a := least(v_me, v_other); v_b := greatest(v_me, v_other);
  update public.connections set status = 'declined'
    where user_a = v_a and user_b = v_b and status not in ('active', 'disconnected');
end;
$$;

grant execute on function public.connect_decline(uuid) to authenticated;
revoke all on function public.connect_decline(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- my_connections: the caller's connections + offers, with the OTHER party's
-- limited profile. Connection graph is private (PRD 5.7): only the two parties
-- can see a row (this view filters by auth.uid()).
-- ----------------------------------------------------------------------------
create view public.my_connections with (security_invoker = off) as
  select
    c.id,
    c.status,
    c.offered_at,
    c.active_at,
    c.disconnected_at,
    c.formed_from_request,
    (case when (select auth.uid()) = c.user_a then c.user_b else c.user_a end) as other_id,
    op.display_name       as other_name,
    op.display_photo_url  as other_photo,
    op.celestial_stage    as other_stage,
    op.trust_rating_avg   as other_trust,
    op.member_since       as other_member_since,
    (case when (select auth.uid()) = c.user_a then c.a_accepted else c.b_accepted end) as i_accepted,
    (case when (select auth.uid()) = c.user_a then c.b_accepted else c.a_accepted end) as they_accepted
  from public.connections c
  join public.profiles op
    on op.id = (case when (select auth.uid()) = c.user_a then c.user_b else c.user_a end)
  where (select auth.uid()) in (c.user_a, c.user_b);

revoke all on public.my_connections from anon;
grant select on public.my_connections to authenticated;

-- The rate screen watches for the other person accepting.
alter publication supabase_realtime add table public.connections;
