import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * The tester/member feedback pipe (You tab → "Send feedback"). Context rides
 * along so triage knows platform + app version without asking.
 */
export async function sendFeedback(userId: string, text: string): Promise<void> {
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    text: text.trim(),
    context: {
      platform: Platform.OS,
      version: Constants.expoConfig?.version ?? null,
    },
  });
  if (error) throw error;
}
