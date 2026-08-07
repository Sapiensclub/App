import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Push registration (spec §6). This activates only in a REAL build (EAS dev /
// preview / production) — Expo Go (SDK 53+) cannot receive remote push, and a
// simulator has no token — so everything here safely no-ops until then. The
// server SEND side (an Edge Function calling the Expo Push API off the
// notifications table) is a launch task; see docs/PRELAUNCH_CHECKLIST.md.

// Foreground behaviour: show a banner (no badge — we don't do badge counts).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Register this device's Expo push token for the signed-in user. Best-effort. */
export async function registerForPush(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return; // not an EAS build yet → no remote token

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_token: token,
        platform: Platform.OS,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'expo_token' },
    );
  } catch {
    // Expo Go / simulator / no projectId / offline — push stays inactive.
  }
}
