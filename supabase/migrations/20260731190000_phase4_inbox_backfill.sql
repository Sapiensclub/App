-- ============================================================================
-- SAPIENS — Phase 4, Chunk 2 fix: backfill inbox chats
-- ============================================================================
-- Connections that turned ACTIVE before the inbox migration (20260731180000)
-- shipped never got an inbox chat — the chat is only opened at the moment a
-- connection activates, and these were already active. Result: opening the
-- thread finds no chat, so sending a message silently no-ops.
--
-- This backfills a missing inbox chat for every active connection (idempotent:
-- skips any that already have one), carrying over the messages from the
-- active-request conversation it formed from — exactly like connect_offer does
-- for new connections.
-- ============================================================================
do $$
declare
  c        record;
  v_inbox  uuid;
  v_active uuid;
begin
  for c in
    select cn.id, cn.user_a, cn.user_b, cn.formed_from_request
    from public.connections cn
    where cn.status = 'active'
      and not exists (
        select 1 from public.chats ch
        where ch.connection_id = cn.id and ch.kind = 'inbox'
      )
  loop
    insert into public.chats (kind, connection_id)
      values ('inbox', c.id)
      returning id into v_inbox;

    insert into public.chat_participants (chat_id, user_id)
      values (v_inbox, c.user_a), (v_inbox, c.user_b);

    if c.formed_from_request is not null then
      select id into v_active from public.chats
        where request_id = c.formed_from_request and kind = 'active'
        order by created_at desc limit 1;
      if v_active is not null then
        insert into public.messages (chat_id, sender_id, type, body, media_url, created_at)
          select v_inbox, sender_id, type, body, media_url, created_at
          from public.messages where chat_id = v_active order by created_at;
      end if;
    end if;
  end loop;
end $$;
