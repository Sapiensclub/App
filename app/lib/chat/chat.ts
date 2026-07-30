import { supabase } from '@/lib/supabase';

export type ChatRow = { id: string; closed_at: string | null };

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  type: 'text' | 'photo' | 'voice' | 'emoji';
  body: string | null;
  media_url: string | null;
  created_at: string;
};

/** Find the active-request chat for a request (RLS returns it only to a party). */
export async function loadChatForRequest(requestId: string): Promise<ChatRow | null> {
  const { data } = await supabase
    .from('chats')
    .select('id, closed_at')
    .eq('request_id', requestId)
    .eq('kind', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ChatRow) ?? null;
}

export async function loadMessages(chatId: string): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, chat_id, sender_id, type, body, media_url, created_at')
    .eq('chat_id', chatId)
    .order('created_at');
  return (data ?? []) as Message[];
}

/** Map of participant id → first name (for showing who said what in groups). */
export async function loadParticipantNames(chatId: string): Promise<Record<string, string>> {
  const { data: parts } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId);
  const ids = (parts ?? []).map((p) => p.user_id as string);
  if (!ids.length) return {};
  const { data: profs } = await supabase
    .from('profiles_public')
    .select('id, display_name')
    .in('id', ids);
  const map: Record<string, string> = {};
  for (const p of profs ?? []) map[p.id as string] = (p.display_name as string) ?? 'Neighbour';
  return map;
}

export async function sendText(chatId: string, senderId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ chat_id: chatId, sender_id: senderId, type: 'text', body });
  if (error) throw error;
}

/** The one-action mid-request escape hatch (PRD 6.13). */
export async function cancelReportBlock(matchId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_report_block', {
    p_match_id: matchId,
    p_reason: reason,
  });
  if (error) throw error;
}
