-- ============================================================================
-- SAPIENS — reconnect after disconnect (owner-approved 2026-08-20)
-- ============================================================================
-- Disconnect is the SOFT exit (silent freeze); block is the hard wall. Until
-- now a disconnected pair could never connect again — connect_offer refused
-- them forever. New rule:
--
--   · A help completed AFTER the disconnect re-opens the door: the connect
--     offer appears again as a completely FRESH double opt-in (both must
--     accept again; silent decline as always). Old helps can't revive it.
--   · On re-acceptance the old inbox thread UN-FREEZES with history intact,
--     and the messages of the help that reunited them carry in.
--   · Same for a silently DECLINED pair: a NEW help makes a fresh offer
--     (stale acceptance flags from the old round no longer leak into it).
--   · Blocked pairs never reach here — dispatch never matches them.

create or replace function public.connect_offer(p_match uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := auth.uid();
  m          public.matches%rowtype;
  c          public.connections%rowtype;
  v_other    uuid; v_a uuid; v_b uuid;
  v_conn_id  uuid;
  v_status   public.connection_status;
  v_formed   uuid;
  v_inbox    uuid;
  v_active   uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into m from public.matches
  where id = p_match and status = 'completed' and v_me in (helper_id, seeker_id);
  if not found then raise exception 'no completed help to connect over'; end if;

  v_other := case when v_me = m.helper_id then m.seeker_id else m.helper_id end;
  v_a := least(v_me, v_other); v_b := greatest(v_me, v_other);

  select * into c from public.connections where user_a = v_a and user_b = v_b;

  if not found then
    insert into public.connections (user_a, user_b, status, formed_from_request, offered_at, a_accepted, b_accepted)
      values (v_a, v_b, 'offered', m.request_id, now(), v_me = v_a, v_me = v_b);

  elsif c.status = 'disconnected' then
    -- Reconnect: only a help completed AFTER the disconnect counts.
    if m.completed_at is null or c.disconnected_at is null
       or m.completed_at <= c.disconnected_at then
      raise exception 'reconnecting needs a new completed help';
    end if;
    update public.connections
      set status = 'offered', offered_at = now(), active_at = null,
          disconnected_at = null, formed_from_request = m.request_id,
          a_accepted = (v_me = v_a), b_accepted = (v_me = v_b)
      where user_a = v_a and user_b = v_b;

  elsif c.status = 'declined' and c.formed_from_request is distinct from m.request_id then
    -- A NEW help after a silent decline → a fresh offer with fresh consent.
    update public.connections
      set status = 'offered', offered_at = now(), active_at = null,
          formed_from_request = m.request_id,
          a_accepted = (v_me = v_a), b_accepted = (v_me = v_b)
      where user_a = v_a and user_b = v_b;

  elsif c.status = 'declined' then
    -- Same help, already silently declined: stay silent — report 'offered'
    -- and change nothing, so stale flags can never accidentally activate.
    return 'offered';

  else
    update public.connections
      set a_accepted = a_accepted or (v_me = v_a),
          b_accepted = b_accepted or (v_me = v_b)
      where user_a = v_a and user_b = v_b;
  end if;

  update public.connections
    set status = (case when a_accepted and b_accepted then 'active' else 'offered' end)::public.connection_status,
        active_at = case when a_accepted and b_accepted and active_at is null then now() else active_at end
    where user_a = v_a and user_b = v_b and status <> 'disconnected'
    returning id, status, formed_from_request into v_conn_id, v_status, v_formed;

  if v_status = 'active' then
    if not exists (select 1 from public.chats where connection_id = v_conn_id and kind = 'inbox') then
      -- First-ever activation: open the permanent inbox + carry the messages
      -- of the help that formed the connection.
      insert into public.chats (kind, connection_id) values ('inbox', v_conn_id) returning id into v_inbox;
      insert into public.chat_participants (chat_id, user_id) values (v_inbox, v_a), (v_inbox, v_b);
      if v_formed is not null then
        select id into v_active from public.chats
          where request_id = v_formed and kind = 'active' order by created_at desc limit 1;
        if v_active is not null then
          insert into public.messages (chat_id, sender_id, type, body, media_url, created_at)
            select v_inbox, sender_id, type, body, media_url, created_at
            from public.messages where chat_id = v_active order by created_at;
        end if;
      end if;
    else
      -- REconnection: un-freeze the old thread (history intact)…
      select id into v_inbox from public.chats
        where connection_id = v_conn_id and kind = 'inbox'
        order by created_at limit 1;
      update public.chats set closed_at = null
        where id = v_inbox and closed_at is not null;
      -- …and carry in the reuniting help's messages, once (skip if any of
      -- them — matched by sender + exact timestamp — are already there).
      if v_formed is not null then
        select id into v_active from public.chats
          where request_id = v_formed and kind = 'active' order by created_at desc limit 1;
        if v_active is not null and not exists (
          select 1
          from public.messages src
          join public.messages dup
            on dup.chat_id = v_inbox
           and dup.sender_id = src.sender_id
           and dup.created_at = src.created_at
          where src.chat_id = v_active
        ) then
          insert into public.messages (chat_id, sender_id, type, body, media_url, created_at)
            select v_inbox, sender_id, type, body, media_url, created_at
            from public.messages where chat_id = v_active order by created_at;
        end if;
      end if;
    end if;
  end if;

  return coalesce(v_status::text, 'offered');
end;
$$;
