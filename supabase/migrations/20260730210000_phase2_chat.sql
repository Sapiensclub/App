-- ============================================================================
-- SAPIENS — Phase 2, Chunk 4: active-request chat + Cancel/Report/Block
-- ============================================================================
-- The active-request chat is scaffolding (PRD 4.1): it opens at confirm and
-- dissolves at completion. Server-readable (evidence, 6.2). Messages/chats RLS
-- already exists from Phase 0; here we (1) open the chat when a match confirms,
-- (2) put messages on realtime, and (3) add the one-action mid-request escape
-- hatch (6.13): Cancel + Report + Block.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. confirm_helper now also OPENS the active-request chat (PRD 4.2)
-- ----------------------------------------------------------------------------
create or replace function public.confirm_helper(p_request_id uuid, p_helper_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seeker   uuid := auth.uid();
  v_match_id uuid;
  v_chat_id  uuid;
  v_code     text;
begin
  if v_seeker is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.requests
    where id = p_request_id and seeker_id = v_seeker and status = 'open'
  ) then
    raise exception 'request not open or not yours';
  end if;
  if not exists (
    select 1 from public.request_responses
    where request_id = p_request_id and helper_id = p_helper_id and status = 'raised'
  ) then
    raise exception 'helper has not raised a hand';
  end if;

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');

  insert into public.matches (request_id, helper_id, seeker_id, status, meetup_code, confirmed_at)
    values (p_request_id, p_helper_id, v_seeker, 'confirmed', v_code, now())
    returning id into v_match_id;

  -- Open the active-request chat between the two parties.
  insert into public.chats (kind, request_id) values ('active', p_request_id)
    returning id into v_chat_id;
  insert into public.chat_participants (chat_id, user_id)
    values (v_chat_id, v_seeker), (v_chat_id, p_helper_id);

  update public.request_responses set status = 'confirmed', updated_at = now()
    where request_id = p_request_id and helper_id = p_helper_id;

  update public.request_responses set status = 'vetoed', updated_at = now()
    where request_id = p_request_id and status = 'raised' and helper_id <> p_helper_id;
  update public.dispatch_targets set outcome = 'expired'
    where request_id = p_request_id and helper_id <> p_helper_id
      and outcome in ('pending', 'raised');

  update public.requests set status = 'matched' where id = p_request_id;

  return v_match_id;
end;
$$;

revoke all on function public.confirm_helper(uuid, uuid) from public, anon;
grant execute on function public.confirm_helper(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Messages on realtime (RLS still applies per subscriber)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;

-- ----------------------------------------------------------------------------
-- 3. Cancel + Report + Block — the one-action escape hatch (PRD 6.13)
-- ----------------------------------------------------------------------------
-- If someone is harassed mid-request, one action must: terminate the match,
-- re-broadcast the request to other helpers, file a report with the chat as
-- evidence, and permanently unmatch the pair. The mirror case (helper harassed
-- by seeker) uses the identical exit — no reliability penalty for leaving an
-- abusive situation (PRD 0.7).
create or replace function public.cancel_report_block(p_match_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := auth.uid();
  m         public.matches%rowtype;
  v_other   uuid;
  v_chat_id uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into m from public.matches where id = p_match_id;
  if not found or v_me not in (m.helper_id, m.seeker_id) then
    raise exception 'not your match';
  end if;

  v_other := case when v_me = m.helper_id then m.seeker_id else m.helper_id end;

  -- 1. Terminate the match immediately.
  update public.matches set status = 'cancelled' where id = p_match_id;

  -- 2. Dissolve the chat (evidence rows stay for the retention window).
  select id into v_chat_id
  from public.chats where request_id = m.request_id and kind = 'active'
  order by created_at desc limit 1;
  if v_chat_id is not null then
    update public.chats set closed_at = now() where id = v_chat_id;
  end if;

  -- 3. File the report with the chat attached as evidence.
  insert into public.reports (reporter_id, reported_id, context, evidence_chat_id, reason, status)
    values (v_me, v_other, 'chat', v_chat_id, coalesce(nullif(trim(p_reason), ''), 'Reported from an active request'), 'open');

  -- 4. Permanently unmatch — dispatch must never pair them again (PRD 5.10).
  insert into public.blocks (blocker_id, blocked_id) values (v_me, v_other)
    on conflict do nothing;

  -- 5. Re-broadcast: the seeker still needs help. Reopen with a fresh window
  --    and ping new helpers (the blocked one is now excluded).
  update public.request_responses set status = 'withdrawn', updated_at = now()
    where request_id = m.request_id and helper_id = v_other;
  update public.requests
    set status = 'open',
        expires_at = now() + interval '30 minutes'
    where id = m.request_id;
  perform public.dispatch_wave(m.request_id);
end;
$$;

revoke all on function public.cancel_report_block(uuid, text) from public, anon;
grant execute on function public.cancel_report_block(uuid, text) to authenticated;
