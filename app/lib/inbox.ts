import { supabase } from '@/lib/supabase';

export type InboxThread = {
  chat_id: string;
  closed_at: string | null;
  connection_id: string;
  connection_status: 'offered' | 'active' | 'declined' | 'disconnected';
  other_id: string;
  other_name: string | null;
  nickname: string | null;
  other_photo: string | null;
  other_stage: string;
  other_trust: number | null;
  last_body: string | null;
  last_type: string | null;
  last_at: string | null;
  last_sender: string | null;
  unread: number;
};

/** Display name = nickname if set, else first name. */
export function threadName(t: { nickname: string | null; other_name: string | null }): string {
  return t.nickname?.trim() || t.other_name?.trim() || 'A neighbour';
}

export async function loadInbox(): Promise<InboxThread[]> {
  const { data } = await supabase
    .from('my_inbox')
    .select('*')
    .order('last_at', { ascending: false, nullsFirst: false });
  return (data ?? []) as InboxThread[];
}

export async function loadInboxThread(otherId: string): Promise<InboxThread | null> {
  const { data } = await supabase.from('my_inbox').select('*').eq('other_id', otherId).maybeSingle();
  return (data as InboxThread) ?? null;
}

export async function setNickname(otherId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('set_nickname', { p_other: otherId, p_name: name });
  if (error) throw error;
}

export async function disconnectConnection(otherId: string): Promise<void> {
  const { error } = await supabase.rpc('disconnect_connection', { p_other: otherId });
  if (error) throw error;
}

export async function blockConnection(otherId: string): Promise<void> {
  const { error } = await supabase.rpc('block_connection', { p_other: otherId });
  if (error) throw error;
}

export async function markChatRead(chatId: string): Promise<void> {
  await supabase.rpc('mark_chat_read', { p_chat: chatId });
}
