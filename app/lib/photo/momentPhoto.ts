import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

const BUCKET = 'moments';

/** Upload a picked selfie (base64) to the user's moments folder; return URL. */
export async function uploadMomentPhoto(userId: string, base64: string): Promise<string> {
  const path = `${userId}/moment_${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
