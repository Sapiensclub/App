-- ============================================================================
-- SAPIENS — fix connect_offer (enum cast)
-- ============================================================================
-- The recompute UPDATE built `status` from a CASE of string literals, which is
-- text — assigning text to the connection_status enum column errored, so the
-- Connect button always failed. Cast the CASE to the enum. Also switched from
-- ON CONFLICT to an explicit exists/insert/update for clarity.
-- ============================================================================

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

  if exists (select 1 from public.connections where user_a = v_a and user_b = v_b) then
    update public.connections
      set a_accepted = a_accepted or (v_me = v_a),
          b_accepted = b_accepted or (v_me = v_b)
      where user_a = v_a and user_b = v_b and status <> 'disconnected';
  else
    insert into public.connections (user_a, user_b, status, formed_from_request, offered_at, a_accepted, b_accepted)
      values (v_a, v_b, 'offered', m.request_id, now(), v_me = v_a, v_me = v_b);
  end if;

  update public.connections
    set status = (case when a_accepted and b_accepted then 'active' else 'offered' end)::public.connection_status,
        active_at = case when a_accepted and b_accepted and active_at is null then now() else active_at end
    where user_a = v_a and user_b = v_b and status <> 'disconnected'
    returning status::text into v_status;

  return coalesce(v_status, 'offered');
end;
$$;

grant execute on function public.connect_offer(uuid) to authenticated;
revoke all on function public.connect_offer(uuid) from public, anon;
