-- ============================================================================
-- SAPIENS — P1 owed feature: voice notes in chat (PRD 4.4/6.6) — storage side
-- ============================================================================
-- Voice messages reuse everything chat photos built: the same private
-- chat-media bucket, the same participant-scoped policies, the same signed-URL
-- reads, and the same retention sweep. The only server-side change is allowing
-- audio mime types in the bucket. (messages.type = 'voice' has existed since
-- Phase 0; duration in seconds rides in messages.body.)
--
-- m4a from phones declares audio/m4a (variants listed for safety); web
-- recording produces audio/webm.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/webm'
]
where id = 'chat-media';
