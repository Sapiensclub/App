import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { timeAgo } from '@/lib/help/timeAgo';
import { loadInbox, threadName, type InboxThread } from '@/lib/inbox';
import { useRealtime } from '@/lib/realtime';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The permanent Inbox (PRD Bucket 6): conversations with your connections.
export default function Inbox() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id;
  const [threads, setThreads] = useState<InboxThread[]>([]);

  const load = useCallback(async () => {
    setThreads(await loadInbox());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live: new messages anywhere → refresh the list.
  useRealtime(myId ? `inbox-${myId}` : null, [{ table: 'messages' }], load);

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text variant="title">Inbox</Text>
      </View>

      {threads.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="Your inbox is quiet"
          body="Help someone, and your first connection begins here."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {threads.map((t) => {
            const name = threadName(t);
            const frozen = t.connection_status === 'disconnected' || !!t.closed_at;
            const preview =
              t.last_type === 'photo'
                ? '📷 Photo'
                : t.last_type && t.last_type !== 'text'
                  ? '📎 Attachment'
                  : t.last_body ??
                    (frozen ? 'This conversation is frozen' : 'Say hello 👋');
            const mine = t.last_sender === myId;
            return (
              <Pressable
                key={t.chat_id}
                onPress={() =>
                  router.push({ pathname: '/connections/inbox/[otherId]', params: { otherId: t.other_id } })
                }
                style={styles.row}
              >
                {t.other_photo ? (
                  <Image source={{ uri: t.other_photo }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="person" size={24} color={colors.accent} />
                  </View>
                )}
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text variant="body" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                      {name}
                    </Text>
                    {t.last_at ? (
                      <Text variant="small" tone="faint">
                        {timeAgo(t.last_at)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowBottom}>
                    <Text
                      variant="small"
                      tone={t.unread > 0 ? 'primary' : 'secondary'}
                      numberOfLines={1}
                      style={{ flex: 1 }}
                    >
                      {mine && t.last_type ? 'You: ' : ''}
                      {preview}
                    </Text>
                    {t.unread > 0 ? (
                      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                        <Text variant="small" weight="bold" tone="onAccent">
                          {t.unread}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
