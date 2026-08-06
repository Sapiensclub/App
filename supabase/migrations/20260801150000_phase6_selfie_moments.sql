-- ============================================================================
-- SAPIENS — Phase 6, Chunk 3: shared selfie moments (double opt-in, PRD 8.4)
-- ============================================================================
-- After a completed help, either person can propose a shared selfie. It is
-- visible ONLY when BOTH consent, removable by EITHER at any time, never
-- searchable, no tap-to-profile. The proposer's consent is set on propose; the
-- other party approves (or removes) from a pending card.
-- ============================================================================

-- Public bucket for moment photos (served in the feed). Files namespaced by uid.
insert into storage.buckets (id, name, public)
values ('moments', 'moments', true)
on conflict (id) do nothing;

create policy "moments: owner uploads own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "moments: owner deletes own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "moments: public read"
  on storage.objects for select to public
  using (bucket_id = 'moments');

-- ----------------------------------------------------------------------------
-- propose_selfie_moment: create a pending selfie for a completed help. The
-- proposer's consent is set; the other party is notified to approve.
-- Slot mapping: participants[1] ↔ consent_a, participants[2] ↔ consent_b.
-- ----------------------------------------------------------------------------
create or replace function public.propose_selfie_moment(p_request uuid, p_photo_url text, p_caption text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  m public.matches%rowtype;
  v_other uuid; v_area text; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into m from public.matches
  where request_id = p_request and status = 'completed' and v_me in (helper_id, seeker_id)
  order by completed_at desc limit 1;
  if not found then raise exception 'no completed help to share'; end if;

  v_other := case when v_me = m.helper_id then m.seeker_id else m.helper_id end;
  select approx_area into v_area from public.requests where id = p_request;

  -- One live selfie per request per proposer.
  if exists (
    select 1 from public.moments
    where request_id = p_request and type = 'selfie'
      and participants[1] = v_me and removed_by is null
  ) then
    raise exception 'you already shared a moment for this help';
  end if;

  insert into public.moments
    (type, request_id, participants, photo_url, caption, area, consent_a, consent_b, visible)
    values ('selfie', p_request, array[v_me, v_other], p_photo_url,
            nullif(trim(p_caption), ''), v_area, true, false, false)
    returning id into v_id;

  insert into public.notifications (user_id, type, payload)
    values (v_other, 'moment_pending', jsonb_build_object('moment_id', v_id));

  return v_id;
end; $$;

-- consent_moment: the other party approves → flips visible when both consent.
create or replace function public.consent_moment(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  update public.moments
    set consent_a = case when participants[1] = v_me then true else consent_a end,
        consent_b = case when participants[2] = v_me then true else consent_b end
    where id = p_id and v_me = any (participants) and removed_by is null;
  update public.moments
    set visible = true
    where id = p_id and consent_a and consent_b and removed_by is null;
end; $$;

-- remove_moment: either participant takes it down, no questions (PRD 8.4).
create or replace function public.remove_moment(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  update public.moments
    set removed_by = v_me, visible = false
    where id = p_id and v_me = any (participants);
end; $$;

grant execute on function public.propose_selfie_moment(uuid, text, text) to authenticated;
grant execute on function public.consent_moment(uuid) to authenticated;
grant execute on function public.remove_moment(uuid) to authenticated;
revoke all on function public.propose_selfie_moment(uuid, text, text) from public, anon;
revoke all on function public.consent_moment(uuid) from public, anon;
revoke all on function public.remove_moment(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- my_pending_moments: selfies awaiting the caller's approval (I'm a participant,
-- not yet visible, and my consent slot is still false). Shows the proposer's
-- first name — they're the other party of a completed help, already known.
-- ----------------------------------------------------------------------------
create view public.my_pending_moments with (security_invoker = off) as
  select
    m.id,
    m.photo_url,
    m.caption,
    m.area,
    m.created_at,
    (select p.display_name from public.profiles p
       where p.id = any (m.participants) and p.id <> (select auth.uid()) limit 1) as from_name
  from public.moments m
  where m.type = 'selfie'
    and m.visible = false
    and m.removed_by is null
    and (select auth.uid()) = any (m.participants)
    and (
      (m.participants[1] = (select auth.uid()) and m.consent_a = false)
      or (m.participants[2] = (select auth.uid()) and m.consent_b = false)
    );

revoke all on public.my_pending_moments from anon;
grant select on public.my_pending_moments to authenticated;
