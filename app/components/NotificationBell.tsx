import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth/AuthProvider';
import { unreadCount } from '@/lib/notifications';
import { useRealtime } from '@/lib/realtime';
import { useTheme } from '@/theme/useTheme';

// The notifications bell (PRD 10.12) — a dot when there's something unread.
export function NotificationBell() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setUnread(await unreadCount());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRealtime(
    session ? `notif-bell-${session.user.id}` : null,
    [{ table: 'notifications', filter: `user_id=eq.${session?.user.id}` }],
    load,
  );

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      style={styles.bell}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
      {unread > 0 ? (
        <View style={[styles.dot, { backgroundColor: colors.accent, borderColor: colors.bg }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
