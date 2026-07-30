import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';

/**
 * Uploads a picked image (as base64) to the user's avatars folder, then sets
 * it as the display photo via the RPC (which is where the real face-match
 * against the KYC selfie will run later). Returns the public URL.
 */
export async function uploadAndSetDisplayPhoto(
  userId: string,
  base64: string,
): Promise<string> {
  const path = `${userId}/avatar_${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: rpcError } = await supabase.rpc('set_display_photo', {
    p_url: publicUrl,
  });
  if (rpcError) throw rpcError;

  return publicUrl;
}
