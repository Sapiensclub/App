import { supabase } from '@/lib/supabase';

// Shapes mirror the disclosure views (server-enforced; the client can only see
// these safe columns).

export type HelperPing = {
  dispatch_id: string;
  request_id: string;
  wave_number: number;
  pinged_at: string;
  outcome: 'pending' | 'raised' | 'ignored' | 'expired';
  approx_distance_m: number | null;
  category_id: string;
  category_label: string;
  category_icon: string | null;
  urgency: 'casual' | 'everyday' | 'urgent' | 'sos';
  timing: 'now' | 'scheduled';
  scheduled_at: string | null;
  approx_area: string | null;
  description: string | null;
  request_status: string;
  expires_at: string | null;
  prefer_women: boolean;
  // Directed asks (PRD 5.5): when this ping is aimed at me by a connection, the
  // seeker's identity is revealed (we already know each other).
  is_directed: boolean;
  directed_to_me: boolean;
  from_name: string | null;
  from_photo: string | null;
};

export type Candidate = {
  request_id: string;
  helper_id: string;
  response_status: string;
  raised_at: string;
  display_name: string | null;
  display_photo_url: string | null;
  celestial_stage: string;
  trust_rating_avg: number | null;
  member_since: string;
  approx_distance_m: number | null;
};

export type MatchDetails = {
  id: string;
  request_id: string;
  helper_id: string;
  seeker_id: string;
  status: 'confirmed' | 'on_the_way' | 'arrived' | 'completed' | 'cancelled';
  meetup_code: string | null;
  confirmed_at: string | null;
  helper_done_at: string | null;
  seeker_confirmed_at: string | null;
  completed_at: string | null;
  meetpoint_lat: number | null;
  meetpoint_lng: number | null;
  approx_area: string | null;
  description: string | null;
  category_id: string;
  category_label: string;
  category_icon: string | null;
  urgency: string;
  interaction_type: 'one_to_one' | 'group' | 'either';
  participant_cap: number | null;
  other_id: string;
  other_name: string | null;
  other_photo: string | null;
  other_stage: string;
  other_trust: number | null;
  helper_distance_m: number | null;
};

/** A verified, pinged helper offers to help. */
export async function raiseHand(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('raise_hand', { p_request_id: requestId });
  if (error) throw error;
}

/** Take a raised hand back while the request is still open. */
export async function withdrawHand(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_hand', { p_request_id: requestId });
  if (error) throw error;
}

/** Seeker declines the current candidate (silent to the next). */
export async function vetoHelper(requestId: string, helperId: string): Promise<void> {
  const { error } = await supabase.rpc('veto_helper', {
    p_request_id: requestId,
    p_helper_id: helperId,
  });
  if (error) throw error;
}

/** Seeker confirms → match created, precise location released. Returns match id. */
export async function confirmHelper(requestId: string, helperId: string): Promise<string> {
  const { data, error } = await supabase.rpc('confirm_helper', {
    p_request_id: requestId,
    p_helper_id: helperId,
  });
  if (error) throw error;
  return data as string;
}

/** Load the current user's single match for a request (one-to-one / helper). */
export async function loadMatchForRequest(requestId: string): Promise<MatchDetails | null> {
  const { data } = await supabase
    .from('match_details')
    .select('*')
    .eq('request_id', requestId)
    .order('confirmed_at')
    .limit(1)
    .maybeSingle();
  return (data as MatchDetails) ?? null;
}

/** Load one match by its id (for the rating flow). */
export async function loadMatchById(matchId: string): Promise<MatchDetails | null> {
  const { data } = await supabase
    .from('match_details')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();
  return (data as MatchDetails) ?? null;
}

/** All of a request's matches visible to the caller (a seeker sees each group
 *  participant; a helper sees only their own). */
export async function loadMatchesForRequest(requestId: string): Promise<MatchDetails[]> {
  const { data } = await supabase
    .from('match_details')
    .select('*')
    .eq('request_id', requestId)
    .order('confirmed_at');
  return (data ?? []) as MatchDetails[];
}

/** Seeker ends a group activity → all participants complete. */
export async function groupEnd(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('group_end', { p_request_id: requestId });
  if (error) throw error;
}

/** Reopen a dead/expired request and re-broadcast (PRD 3.10). */
export async function retryRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('retry_request', { p_request_id: requestId });
  if (error) throw error;
}

// ── Meeting & completion status transitions (Chunk 5) ──────────────────────
export async function helperOnMyWay(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('helper_on_my_way', { p_match_id: matchId });
  if (error) throw error;
}
export async function helperArrived(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('helper_arrived', { p_match_id: matchId });
  if (error) throw error;
}
export async function helperMarkDone(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('helper_mark_done', { p_match_id: matchId });
  if (error) throw error;
}
export async function seekerConfirmDone(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('seeker_confirm_done', { p_match_id: matchId });
  if (error) throw error;
}
