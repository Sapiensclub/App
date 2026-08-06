import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { timeAgo } from '@/lib/help/timeAgo';
import {
  describeNotification,
  loadNotifications,
  markAllRead,
  type AppNotification,
} from '@/lib/notifications';
import { useRealtime } from '@/lib/realtime';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Notifications() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    setItems(await loadNotifications());
  }, []);

  // Load once, then mark everything read (viewing = read) so the bell clears.
  // We keep the just-loaded list in state so this visit still shows what's new.
  useEffect(() => {
    (async () => {
      await load();
      await markAllRead();
    })();
  }, [load]);

  // Only reload on NEW notifications (not our own mark-read updates).
  useRealtime(
    session ? `notif-screen-${session.user.id}` : null,
    [{ table: 'notifications', filter: `user_id=eq.${session?.user.id}`, event: 'INSERT' }],
    load,
  );

  function onOpen(n: AppNotification) {
    const p = n.payload ?? {};
    const rid = typeof p.request_id === 'string' ? p.request_id : null;
    const oid = typeof p.other_id === 'string' ? p.other_id : null;
    switch (n.type) {
      case 'hand_raised':
      case 'help_completed':
        if (rid) router.push({ pathname: '/request/[id]', params: { id: rid } });
        break;
      case 'you_were_confirmed':
        if (rid) router.push({ pathname: '/help/[requestId]', params: { requestId: rid } });
        break;
      case 'new_connection':
      case 'connection_milestone':
        if (oid) router.push({ pathname: '/connections/[otherId]', params: { otherId: oid } });
        break;
    }
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading" weight="bold" style={styles.topTitle}>
          Notifications
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing new"
          body="Updates about your help, your connections, and milestones will appear here."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((n) => {
            const d = describeNotification(n);
            return (
              <Pressable
                key={n.id}
                onPress={() => onOpen(n)}
                style={[
                  styles.row,
                  {
                    backgroundColor: n.read ? colors.surface : colors.accentSoft,
                    borderColor: colors.surfaceEdge,
                  },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: colors.bg }]}>
                  <Ionicons name={d.icon} size={22} color={colors.accent} />
                </View>
                <View style={styles.body}>
                  <View style={styles.rowTop}>
                    <Text variant="body" weight="bold" style={{ flex: 1 }}>
                      {d.title}
                    </Text>
                    <Text variant="small" tone="faint">
                      {timeAgo(n.created_at)}
                    </Text>
                  </View>
                  {d.body ? (
                    <Text variant="small" tone="secondary">
                      {d.body}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          <Text variant="small" tone="faint" center style={styles.bottom}>
            That&apos;s everything — you&apos;re all caught up.
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  topTitle: { flex: 1, textAlign: 'center' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  icon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bottom: { paddingTop: spacing.lg },
});
