import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { CHAT_MEDIA_BUCKET } from './chatPhoto';

/**
 * Upload a recorded voice note into the chat's folder (same private bucket +
 * participant-only storage RLS as photos). Returns the storage PATH that
 * messages.media_url stores; playback goes through signed URLs.
 *
 * Phones record m4a (AAC); web records webm — named + typed accordingly so
 * each platform's player can decode its own recordings.
 */
export async function uploadChatVoice(chatId: string, localUri: string): Promise<string> {
  const isWeb = Platform.OS === 'web';
  const path = `${chatId}/${Date.now()}.${isWeb ? 'webm' : 'm4a'}`;
  const bytes = isWeb
    ? new Uint8Array(await (await fetch(localUri)).arrayBuffer())
    : await new File(localUri).bytes();
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: isWeb ? 'audio/webm' : 'audio/m4a' });
  if (error) throw error;
  return path;
}
