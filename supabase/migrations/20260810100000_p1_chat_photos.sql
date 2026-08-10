-- ============================================================================
-- SAPIENS — P1 owed feature: photos in chat (PRD 4.4 / 6.6)
-- ============================================================================
-- Adds photo messages to BOTH chat surfaces (active-request + inbox). The
-- messages table has supported type='photo' + media_url since Phase 0; this
-- migration adds the storage side and the cleanup rules:
--
--   1. A PRIVATE 'chat-media' bucket (unlike the public 'moments' bucket) —
--      chat photos are between the people meeting, so reads require a signed
--      URL and storage RLS scoped to chat participants. Files are namespaced
--      by chat id: <chat_id>/<filename>. messages.media_url stores the PATH,
--      not a URL; clients sign it on read.
--   2. retention_sweep() also deletes chat-media objects for purged active
--      chats — a photo must never outlive the conversation it belonged to.
--      (Inbox chats are permanent, so their photos are too.)
-- ============================================================================

-- Private bucket. 5 MB cap per file; images only (voice notes will extend the
-- mime list in their own migration).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Upload: only a participant of that OPEN chat may add media to its folder.
-- (Text compare on the folder name — no ::uuid cast, so a malformed path is a
--  clean policy denial instead of a cast error.)
create policy "chat-media: participant uploads into own open chat"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.chats c
      where c.id::text = (storage.foldername(name))[1]
        and c.closed_at is null
        and public.is_chat_participant(c.id)
    )
  );

-- Read: participants only (this is also what authorizes createSignedUrl for
-- non-service clients). Active-request chats stay server-readable evidence via
-- the service role, which bypasses RLS.
create policy "chat-media: participant reads own chats media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.chats c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_chat_participant(c.id)
    )
  );

-- No client update/delete policies: messages are immutable once sent, and the
-- retention sweep (definer) handles deletion.

-- ----------------------------------------------------------------------------
-- retention_sweep(): same as Phase 8 Chunk 3, plus chat-media cleanup for the
-- chats whose messages are being purged. Storage cleanup is wrapped in its own
-- exception guard so a storage hiccup can never block the data purge.
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

  -- Photos first: storage objects for the active chats being purged below.
  -- Independent criteria (based on chats, not messages), so if this ever
  -- fails it self-heals on the next daily run.
  begin
    delete from storage.objects o
      where o.bucket_id = 'chat-media'
        and exists (
          select 1 from public.chats c
          where c.id::text = (storage.foldername(o.name))[1]
            and c.kind = 'active'
            and c.closed_at is not null
            and c.closed_at < now() - make_interval(days => coalesce(v_chat, 60))
            and not exists (
              select 1 from public.reports r
              where r.evidence_chat_id = c.id and r.status in ('open', 'reviewing')));
  exception when others then
    raise notice 'chat-media cleanup skipped (%)', sqlerrm;
  end;

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
