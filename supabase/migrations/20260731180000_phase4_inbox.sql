-- ============================================================================
-- SAPIENS — Phase 4, Chunk 2: the permanent Inbox (Bucket 6)
-- ============================================================================
-- The lasting conversation between connections. When a connection turns active,
-- an 'inbox' chat opens and the active-request conversation CARRIES OVER
-- (PRD 4.8/5.4). Nicknames (6.5), unread tracking, disconnect (silent, frozen-
-- but-visible, 5.9) and block (5.10). Server-readable in v1 (E2E is [P2]).
-- ============================================================================

-- Read tracking for unread badges.
alter table public.chat_participants
  add column if not exists last_read_at timestamptz;

-- Per-viewer nicknames for a connection (PRD 6.5). Private to the owner.
create table if not exists public.connection_nicknames (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  other_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null,
  primary key (owner_id, other_id)
);
alter table public.connection_nicknames enable row level security;
create policy "nicknames: owner manages own"
  on public.connection_nicknames for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- connect_offer: on becoming active, open the inbox chat and carry over the
-- active-request messages.
-- ----------------------------------------------------------------------------
create or replace function public.connect_offer(p_match uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := auth.uid();
  m          public.matches%rowtype;
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
    returning id, status, formed_from_request into v_conn_id, v_status, v_formed;

  -- On first activation, open the permanent inbox chat + carry the messages.
  if v_status = 'active'
     and not exists (select 1 from public.chats where connection_id = v_conn_id and kind = 'inbox') then
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
  end if;

  return v_status::text;
end;
$$;

grant execute on function public.connect_offer(uuid) to authenticated;
revoke all on function public.connect_offer(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- Inbox RPCs
-- ----------------------------------------------------------------------------
create or replace function public.set_nickname(p_other uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then
    delete from public.connection_nicknames where owner_id = auth.uid() and other_id = p_other;
  else
    insert into public.connection_nicknames (owner_id, other_id, nickname)
      values (auth.uid(), p_other, trim(p_name))
    on conflict (owner_id, other_id) do update set nickname = trim(p_name);
  end if;
end; $$;

create or replace function public.disconnect_connection(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  v_a := least(v_me, p_other); v_b := greatest(v_me, p_other);
  update public.connections set status = 'disconnected', disconnected_at = now()
    where user_a = v_a and user_b = v_b;
  -- Freeze the thread (history stays visible, no new messages) — PRD 5.9.
  update public.chats set closed_at = now()
    where kind = 'inbox' and closed_at is null
      and connection_id in (select id from public.connections where user_a = v_a and user_b = v_b);
end; $$;

create or replace function public.block_connection(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  v_a := least(v_me, p_other); v_b := greatest(v_me, p_other);
  update public.connections set status = 'disconnected', disconnected_at = now()
    where user_a = v_a and user_b = v_b;
  update public.chats set closed_at = now()
    where kind = 'inbox' and closed_at is null
      and connection_id in (select id from public.connections where user_a = v_a and user_b = v_b);
  -- Hard block — dispatch never rematches (PRD 5.10).
  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_other) on conflict do nothing;
end; $$;

create or replace function public.mark_chat_read(p_chat uuid)
returns void language sql security definer set search_path = '' as $$
  update public.chat_participants set last_read_at = now()
  where chat_id = p_chat and user_id = auth.uid();
$$;

grant execute on function public.set_nickname(uuid, text) to authenticated;
grant execute on function public.disconnect_connection(uuid) to authenticated;
grant execute on function public.block_connection(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
revoke all on function public.set_nickname(uuid, text) from public, anon;
revoke all on function public.disconnect_connection(uuid) from public, anon;
revoke all on function public.block_connection(uuid) from public, anon;
revoke all on function public.mark_chat_read(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- my_inbox: the caller's inbox threads — other party (+ nickname), last
-- message, unread count, and whether the thread is frozen.
-- ----------------------------------------------------------------------------
create view public.my_inbox with (security_invoker = off) as
  select
    ch.id           as chat_id,
    ch.closed_at,
    c.id            as connection_id,
    c.status        as connection_status,
    (case when (select auth.uid()) = c.user_a then c.user_b else c.user_a end) as other_id,
    op.display_name as other_name,
    nn.nickname,
    op.display_photo_url as other_photo,
    op.celestial_stage   as other_stage,
    op.trust_rating_avg  as other_trust,
    lm.body       as last_body,
    lm.type       as last_type,
    lm.created_at as last_at,
    lm.sender_id  as last_sender,
    (select count(*) from public.messages mm
      where mm.chat_id = ch.id
        and mm.sender_id <> (select auth.uid())
        and mm.created_at > coalesce(
          (select last_read_at from public.chat_participants
             where chat_id = ch.id and user_id = (select auth.uid())), 'epoch'::timestamptz)) as unread
  from public.chats ch
  join public.connections c on c.id = ch.connection_id
  join public.profiles op
    on op.id = (case when (select auth.uid()) = c.user_a then c.user_b else c.user_a end)
  left join public.connection_nicknames nn
    on nn.owner_id = (select auth.uid())
   and nn.other_id = (case when (select auth.uid()) = c.user_a then c.user_b else c.user_a end)
  left join lateral (
    select body, type, created_at, sender_id
    from public.messages where chat_id = ch.id order by created_at desc limit 1
  ) lm on true
  where ch.kind = 'inbox'
    and (select auth.uid()) in (c.user_a, c.user_b);

revoke all on public.my_inbox from anon;
grant select on public.my_inbox to authenticated;
