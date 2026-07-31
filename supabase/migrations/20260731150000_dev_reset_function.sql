-- ============================================================================
-- SAPIENS — DEV ONLY: full help-data reset
-- ============================================================================
-- The Moneta ledger is append-only (a BEFORE DELETE trigger forbids deletes),
-- which correctly makes normal cleanup impossible. TRUNCATE does not fire that
-- row-level trigger, so this SECURITY DEFINER function can wipe all
-- transactional help data for a clean testing slate.
--
--   ⚠️  DEV/STAGING ONLY — service_role only, never exposed to clients.
--       REMOVE before public launch (add to the pre-launch checklist).
-- ============================================================================

create or replace function public.admin_reset_help_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table
    public.moneta_ledger,
    public.ratings,
    public.messages,
    public.chat_participants,
    public.chats,
    public.matches,
    public.dispatch_targets,
    public.request_responses,
    public.connections,
    public.requests,
    public.blocks,
    public.appreciations,
    public.moments,
    public.sos_events,
    public.notifications
  cascade;

  -- Reset the cached reputation counters back to a fresh account.
  update public.profiles
    set unique_helps = 0, total_helps = 0, moneta_lifetime = 0, moneta_balance = 0,
        trust_rating_avg = null, goodness_score = 0, celestial_stage = 'new_moon';

  -- Clear stale helper locations (re-synced when the app next opens).
  update public.helper_preferences set last_location = null, location_updated_at = null;
end;
$$;

revoke all on function public.admin_reset_help_data() from public, anon, authenticated;
grant execute on function public.admin_reset_help_data() to service_role;
