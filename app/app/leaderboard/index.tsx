import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Card, EmptyState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Row = {
  user_id: string;
  display_name: string | null;
  display_photo_url: string | null;
  celestial_stage: string;
  new_uniques: number;
  rank: number;
};

// The monthly leaderboard (PRD 7.9): new people reached this month. Recognition
// only, ranked by uniques — never a raw help count.
export default function Leaderboard() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('leaderboard_month')
      .select('*')
      .order('rank')
      .limit(50);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });
  const mine = rows.find((r) => r.user_id === myId);

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.topBar}>
        <Ionicons name="arrow-back" size={26} color={colors.textPrimary} onPress={() => router.back()} />
        <Text variant="heading" weight="bold" style={styles.topTitle}>
          {monthName} leaderboard
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No new circles yet this month"
          body="Help someone new and you'll be the first on the board. It counts new people reached — not repeats."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text variant="small" tone="secondary" center style={styles.sub}>
            New people reached this month. Recognition only — no scores to chase.
          </Text>

          {rows.map((r) => {
            const stage = celestialInfo(r.celestial_stage);
            const isMe = r.user_id === myId;
            return (
              <Card
                key={r.user_id}
                style={StyleSheet.flatten([
                  styles.rowCard,
                  isMe ? { borderColor: colors.accent, borderWidth: 1.5 } : null,
                ])}
              >
                <View style={styles.row}>
                  <Text variant="heading" weight="extrabold" style={[styles.rank, { color: rankColor(r.rank, colors) }]}>
                    {r.rank}
                  </Text>
                  {r.display_photo_url ? (
                    <Image source={{ uri: r.display_photo_url }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name="person" size={20} color={colors.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="bold">
                      {isMe ? 'You' : r.display_name ?? 'A neighbour'}
                    </Text>
                    <View style={styles.stageRow}>
                      <Ionicons name={stage.icon} size={13} color={colors.textFaint} />
                      <Text variant="small" tone="faint">
                        {stage.label}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.countWrap}>
                    <Text variant="heading" weight="extrabold" tone="accent">
                      {r.new_uniques}
                    </Text>
                    <Text variant="small" tone="faint">
                      {r.new_uniques === 1 ? 'person' : 'people'}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}

          {!mine ? (
            <Text variant="small" tone="faint" center style={styles.youNote}>
              You haven&apos;t reached anyone new this month yet — help someone to
              join the board.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function rankColor(rank: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (rank === 1) return colors.gold;
  return colors.textFaint;
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
  sub: { paddingBottom: spacing.sm },
  rowCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  countWrap: { alignItems: 'center', minWidth: 52 },
  youNote: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
});
