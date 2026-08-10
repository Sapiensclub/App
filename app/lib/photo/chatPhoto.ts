import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';

/** PRIVATE bucket (unlike 'moments') — reads go through signed URLs. */
export const CHAT_MEDIA_BUCKET = 'chat-media';

/**
 * Camera or library → compressed JPEG base64, or null if cancelled/denied.
 * quality < 1 re-encodes the image, which also drops EXIF metadata (incl. GPS)
 * — important: a chat photo must never leak a precise location by accident.
 */
export async function pickChatPhoto(fromCamera: boolean): Promise<string | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow access in Settings to send a photo.');
    return null;
  }
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
  if (result.canceled || !result.assets[0]?.base64) return null;
  return result.assets[0].base64;
}

/**
 * Upload into the chat's folder — storage RLS only accepts participants of
 * that open chat. Returns the storage PATH (what messages.media_url stores);
 * display always goes through a signed URL, never a public one.
 */
export async function uploadChatPhoto(chatId: string, base64: string): Promise<string> {
  const path = `${chatId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, decode(base64), { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
