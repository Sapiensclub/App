import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, EmptyState, IconButton, Screen, Text } from '@/components/ui';
import { celestialInfo } from '@/lib/celestial';
import { loadMyConnections, type Connection } from '@/lib/connections';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Connections() {
  const { colors } = useTheme();
  const [rows, setRows] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setRows(await loadMyConnections());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.topBar}>
        <IconButton name="arrow-back" label="Back" onPress={() => router.back()} />
        <Text variant="heading" weight="bold" style={styles.topTitle}>
          Your connections
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No connections yet"
          body="Help someone, and if you both choose to connect, they'll appear here — the start of a real friendship."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rows.map((c) => {
            const stage = celestialInfo(c.other_stage);
            return (
              <Pressable
                key={c.id}
                onPress={() =>
                  router.push({ pathname: '/connections/[otherId]', params: { otherId: c.other_id } })
                }
              >
                <Card style={styles.rowCard}>
                  <View style={styles.row}>
                    {c.other_photo ? (
                      <Image source={{ uri: c.other_photo }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name="person" size={22} color={colors.accent} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text variant="body" weight="bold">
                        {c.other_name ?? 'A neighbour'}
                      </Text>
                      <View style={styles.stageRow}>
                        <Ionicons name={stage.icon} size={13} color={colors.textFaint} />
                        <Text variant="small" tone="faint">
                          {stage.label}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                  </View>
                </Card>
              </Pressable>
            );
          })}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  rowCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});
