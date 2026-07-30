import { supabase } from '@/lib/supabase';

export type Rating = {
  id: string;
  match_id: string;
  rater_id: string;
  ratee_id: string;
  stars: number;
  feedback_text: string | null;
  submitted_at: string;
  revealed: boolean;
};

/** The rating I gave for this match (if any). */
export async function loadMyRating(matchId: string, myId: string): Promise<Rating | null> {
  const { data } = await supabase
    .from('ratings')
    .select('*')
    .eq('match_id', matchId)
    .eq('rater_id', myId)
    .maybeSingle();
  return (data as Rating) ?? null;
}

/** The rating ABOUT me for this match — RLS returns it only once revealed
 *  (i.e. both of us have rated). This is the double-blind, enforced in data. */
export async function loadRatingAboutMe(matchId: string, myId: string): Promise<Rating | null> {
  const { data } = await supabase
    .from('ratings')
    .select('*')
    .eq('match_id', matchId)
    .eq('ratee_id', myId)
    .maybeSingle();
  return (data as Rating) ?? null;
}

export async function submitRating(
  matchId: string,
  raterId: string,
  rateeId: string,
  stars: number,
  feedbackText: string,
): Promise<void> {
  const { error } = await supabase.from('ratings').insert({
    match_id: matchId,
    rater_id: raterId,
    ratee_id: rateeId,
    stars,
    feedback_text: feedbackText.trim() || null,
  });
  if (error) throw error;
}
