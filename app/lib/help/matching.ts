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
  other_id: string;
  other_name: string | null;
  other_photo: string | null;
  other_stage: string;
  other_trust: number | null;
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

/** Load the match for a given request that the current user is part of. */
export async function loadMatchForRequest(requestId: string): Promise<MatchDetails | null> {
  const { data } = await supabase
    .from('match_details')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();
  return (data as MatchDetails) ?? null;
}
