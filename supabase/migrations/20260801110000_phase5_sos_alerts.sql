-- ============================================================================
-- SAPIENS — Phase 5, Chunk 2: SOS trusted-contact alerts (PRD 10.9, Layer 1)
-- ============================================================================
-- Layer 1 of SOS: alert the person's trusted contacts with a location link.
-- Delivery in P1 is DEVICE-NATIVE (the phone's own SMS/share, opened pre-filled
-- by the app) — no SMS vendor or DLT registration needed yet. A provider seam
-- (lib/sos/sosAlerter.ts) lets a server-sent SMS path replace it later.
--
-- The DB just records that contacts were alerted, for the "are you safe?" flow
-- and future Trust & Safety review. trusted_contacts already exists (Phase 0).
-- ============================================================================

alter table public.sos_events
  add column if not exists alerted_at timestamptz;

-- Record that the owner triggered the trusted-contact alert for an SOS.
create or replace function public.mark_sos_alerted(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  update public.sos_events
    set alerted_at = now()
    where id = p_id and user_id = v_me;
end;
$$;

grant execute on function public.mark_sos_alerted(uuid) to authenticated;
revoke all on function public.mark_sos_alerted(uuid) from public, anon;
