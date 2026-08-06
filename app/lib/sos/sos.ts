import { supabase } from '@/lib/supabase';

// SOS — the guarded safety button (PRD 10.9). Chunk 1: fire + resolve + the
// 112 dialer path. Trusted-contact alerting arrives in Chunk 2.

export type SosEvent = {
  id: string;
  user_id: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  alerted_at: string | null;
  daily_count: number;
};

export type FireSosResult = {
  id: string;
  daily_count: number;
  soft_limit: number;
  over_limit: boolean;
};

export type TrustedContact = {
  id: string;
  name: string;
  phone: string;
  slot: number;
};

/** The caller's trusted contacts (1–3, captured at onboarding). */
export async function loadTrustedContacts(): Promise<TrustedContact[]> {
  const { data } = await supabase
    .from('trusted_contacts')
    .select('id, name, phone, slot')
    .order('slot');
  return (data ?? []) as TrustedContact[];
}

/** Record that the owner triggered the trusted-contact alert. */
export async function markSosAlerted(id: string): Promise<void> {
  await supabase.rpc('mark_sos_alerted', { p_id: id });
}

/** Record an SOS press. Server computes the nth-today count. */
export async function fireSos(coords: { lat: number; lng: number } | null): Promise<FireSosResult> {
  const { data, error } = await supabase.rpc('fire_sos', {
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
  });
  if (error) throw error;
  return data as FireSosResult;
}

/** Mark an SOS resolved ("I'm safe"). */
export async function resolveSos(id: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_sos', { p_id: id });
  if (error) throw error;
}

/** The caller's current unresolved SOS, if any. */
export async function loadActiveSos(): Promise<SosEvent | null> {
  const { data } = await supabase
    .from('sos_events')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SosEvent) ?? null;
}
