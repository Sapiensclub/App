-- ============================================================================
-- SAPIENS — Phase 3, Chunk 2: double-blind ratings (PRD 0.8)
-- ============================================================================
-- Both parties rate after a help. Neither sees the other's until BOTH submit
-- (enforced by RLS: the ratee can read a rating only once `revealed`). When the
-- second rating lands, this trigger reveals both and recomputes each ratee's
-- Trust meter (average stars received). Ratings are decoupled from Moneta —
-- Moneta already released on completion, whether or not anyone rates.
-- ============================================================================

create or replace function public.on_rating_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_both boolean;
begin
  -- Has the OTHER party already rated this match? (their row: rater=my ratee)
  select exists (
    select 1 from public.ratings
    where match_id = new.match_id
      and rater_id = new.ratee_id
      and ratee_id = new.rater_id
  ) into v_both;

  if v_both then
    -- Reveal both rows (this UPDATE does not re-fire an INSERT trigger).
    update public.ratings set revealed = true where match_id = new.match_id;

    -- Recompute Trust (avg stars received, revealed only) for both people.
    update public.profiles p
      set trust_rating_avg = (
            select round(avg(stars)::numeric, 2)
            from public.ratings where ratee_id = p.id and revealed = true
          ),
          updated_at = now()
      where p.id in (new.rater_id, new.ratee_id);
  end if;

  return new;
end;
$$;

create trigger ratings_on_submit
  after insert on public.ratings
  for each row execute function public.on_rating_submitted();

-- The two parties watch for the reveal live.
alter publication supabase_realtime add table public.ratings;
