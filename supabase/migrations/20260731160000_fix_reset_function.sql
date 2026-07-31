-- ============================================================================
-- SAPIENS — DEV: fix admin_reset_help_data (WHERE clauses required)
-- ============================================================================
-- Supabase guards against UPDATE/DELETE without a WHERE clause; the reset
-- function's bare UPDATEs failed and rolled the whole reset back. Add trivial
-- WHERE clauses. (Still DEV/STAGING only — remove before launch.)
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

  update public.profiles
    set unique_helps = 0, total_helps = 0, moneta_lifetime = 0, moneta_balance = 0,
        trust_rating_avg = null, goodness_score = 0, celestial_stage = 'new_moon'
    where id is not null;

  update public.helper_preferences
    set last_location = null, location_updated_at = null
    where user_id is not null;
end;
$$;
