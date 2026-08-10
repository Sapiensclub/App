import { CHAT_MEDIA_BUCKET } from '@/lib/photo/chatPhoto';
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
  /** Short-lived signed URL for private media (photo/voice), added on load. */
  media_signed_url?: string | null;
};

/** Signed URLs live one hour; every loadMessages() re-signs, so they stay fresh. */
const SIGNED_URL_TTL_S = 60 * 60;

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
  return withSignedMediaUrls((data ?? []) as Message[]);
}

/**
 * Media lives in a PRIVATE bucket (chat photos are only for the people in the
 * chat), so stored paths become short-lived signed URLs here. Batch-signed in
 * one round trip; storage RLS re-checks the caller is a participant.
 */
async function withSignedMediaUrls(messages: Message[]): Promise<Message[]> {
  const paths = messages
    .filter((m) => m.type !== 'text' && m.media_url)
    .map((m) => m.media_url as string);
  if (!paths.length) return messages;
  const { data } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_S);
  const byPath = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
  }
  return messages.map((m) =>
    m.type !== 'text' && m.media_url
      ? { ...m, media_signed_url: byPath.get(m.media_url) ?? null }
      : m,
  );
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

/** Send an already-uploaded photo (mediaPath from uploadChatPhoto). */
export async function sendPhoto(chatId: string, senderId: string, mediaPath: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ chat_id: chatId, sender_id: senderId, type: 'photo', media_url: mediaPath });
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
