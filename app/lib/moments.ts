import { supabase } from '@/lib/supabase';

// The community Moments feed (PRD Bucket 8). Reads go through the safe
// moments_feed / my_pending_moments views (first names only, no ids, no counts).

export type FeedMoment = {
  id: string;
  type: 'help' | 'milestone' | 'selfie';
  caption: string | null;
  area: string | null;
  photo_url: string | null;
  created_at: string;
  participant_names: string[] | null;
  mine: boolean;
  i_appreciated: boolean;
};

export type PendingMoment = {
  id: string;
  photo_url: string | null;
  caption: string | null;
  area: string | null;
  created_at: string;
  from_name: string | null;
};

export async function loadFeed(): Promise<FeedMoment[]> {
  const { data } = await supabase.from('moments_feed').select('*');
  return (data ?? []) as FeedMoment[];
}

export async function loadPendingMoments(): Promise<PendingMoment[]> {
  const { data } = await supabase
    .from('my_pending_moments')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as PendingMoment[];
}

/** ❤️ Appreciate — one gesture, count hidden. Adds/removes the caller's heart. */
export async function setAppreciated(momentId: string, userId: string, on: boolean): Promise<void> {
  if (on) {
    await supabase.from('appreciations').insert({ moment_id: momentId, user_id: userId });
  } else {
    await supabase.from('appreciations').delete().eq('moment_id', momentId).eq('user_id', userId);
  }
}

export async function proposeSelfie(requestId: string, photoUrl: string, caption: string): Promise<void> {
  const { error } = await supabase.rpc('propose_selfie_moment', {
    p_request: requestId,
    p_photo_url: photoUrl,
    p_caption: caption,
  });
  if (error) throw error;
}

export async function consentMoment(id: string): Promise<void> {
  const { error } = await supabase.rpc('consent_moment', { p_id: id });
  if (error) throw error;
}

export async function removeMoment(id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_moment', { p_id: id });
  if (error) throw error;
}

/** Aggregate glance — visible help moments in the last 7 days. */
export async function recentHelpCount(): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { count } = await supabase
    .from('moments')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'help')
    .eq('visible', true)
    .gte('created_at', weekAgo);
  return count ?? 0;
}
