-- ============================================================================
-- SAPIENS — Phase 3, Chunk 1: the Moneta engine (unique-help rule, PRD 7.1)
-- ============================================================================
-- When a match completes, the HELPER earns rewards — but only on the FIRST-EVER
-- completed help with a given person. The append-only ledger + the partial
-- unique index from Phase 0 (moneta_unique_help_pair_idx) make a second earn
-- per pair impossible; repeat helps still count toward the steadfast total.
--
-- All of this is server-side and derived from the ledger, so it is auditable
-- and cannot be gamed by a client.
-- ============================================================================

-- Tunable for the Goodness curve (PRD 7.7 / A21): 100 * (1 - e^(-uniqueHelps/k))
insert into public.dispatch_config (key, value) values
  ('goodness_k', '280'::jsonb)
on conflict (key) do nothing;

-- Celestial stage from unique helps (PRD 7.8 thresholds).
create or replace function public.celestial_stage_for(p_unique integer)
returns public.celestial_stage
language sql immutable set search_path = '' as $$
  select case
    when p_unique >= 1000 then 'galaxy'::public.celestial_stage
    when p_unique >= 500  then 'golden_sun'::public.celestial_stage
    when p_unique >= 100  then 'full_moon'::public.celestial_stage
    when p_unique >= 50   then 'half_moon'::public.celestial_stage
    when p_unique >= 10   then 'crescent'::public.celestial_stage
    else 'new_moon'::public.celestial_stage
  end;
$$;

-- ----------------------------------------------------------------------------
-- Award on completion. AFTER UPDATE on matches, only when status flips to
-- 'completed'. Handles solo confirm, auto-confirm, and group-end (fires per
-- completed row, so every group helper is rewarded).
-- ----------------------------------------------------------------------------
create or replace function public.award_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_pair boolean;
  v_unique   integer;
  v_total    integer;
  v_earned   integer;
  v_spent    integer;
  v_k        double precision;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;  -- only act on the transition into completed
  end if;

  -- Is this the helper's first completed help with this seeker?
  v_new_pair := not exists (
    select 1 from public.moneta_ledger
    where user_id = new.helper_id and counterparty_id = new.seeker_id and type = 'earned'
  );

  if v_new_pair then
    -- Award exactly 1 Moneta. The partial unique index is the hard backstop
    -- against a double-award race.
    insert into public.moneta_ledger (user_id, help_ref, amount, type, counterparty_id)
    values (new.helper_id, new.id, 1, 'earned', new.seeker_id)
    on conflict do nothing;
  end if;

  -- Recompute the helper's cached counters from the source of truth.
  select count(*) filter (where type = 'earned'),
         coalesce(sum(amount) filter (where type = 'earned'), 0),
         coalesce(sum(amount) filter (where type = 'spent'), 0)
    into v_unique, v_earned, v_spent
  from public.moneta_ledger where user_id = new.helper_id;

  -- Steadfast: every completed help with this helper, repeats included.
  select count(*) into v_total
  from public.matches where helper_id = new.helper_id and status = 'completed';

  select (value)::double precision into v_k from public.dispatch_config where key = 'goodness_k';

  update public.profiles
  set unique_helps    = v_unique,
      total_helps     = v_total,
      moneta_lifetime = v_earned,
      moneta_balance  = v_earned - v_spent,
      celestial_stage = public.celestial_stage_for(v_unique),
      goodness_score  = round((100 * (1 - exp(-v_unique / coalesce(v_k, 280))))::numeric, 2),
      updated_at      = now()
  where id = new.helper_id;

  return new;
end;
$$;

create trigger matches_award_on_completion
  after update on public.matches
  for each row execute function public.award_on_completion();

-- Let the two parties see their profile counters move live (owner reads own
-- profile row; realtime just needs the table published).
alter publication supabase_realtime add table public.profiles;
