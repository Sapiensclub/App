import { supabase } from '@/lib/supabase';

export type Connection = {
  id: string;
  status: 'offered' | 'active' | 'declined' | 'disconnected';
  offered_at: string;
  active_at: string | null;
  disconnected_at: string | null;
  formed_from_request: string | null;
  other_id: string;
  other_name: string | null;
  other_photo: string | null;
  other_stage: string;
  other_trust: number | null;
  other_member_since: string;
  i_accepted: boolean;
  they_accepted: boolean;
};

/** The caller's active connections. */
export async function loadMyConnections(): Promise<Connection[]> {
  const { data } = await supabase
    .from('my_connections')
    .select('*')
    .eq('status', 'active')
    .order('active_at', { ascending: false });
  return (data ?? []) as Connection[];
}

/** The connection row (any status) with a specific person, if any. */
export async function loadConnectionWith(otherId: string): Promise<Connection | null> {
  const { data } = await supabase
    .from('my_connections')
    .select('*')
    .eq('other_id', otherId)
    .maybeSingle();
  return (data as Connection) ?? null;
}

/** Accept the Connect offer for a completed help. Returns the new status. */
export async function connectOffer(matchId: string): Promise<string> {
  const { data, error } = await supabase.rpc('connect_offer', { p_match: matchId });
  if (error) throw error;
  return data as string;
}

/** Silently decline. */
export async function connectDecline(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('connect_decline', { p_match: matchId });
  if (error) throw error;
}
