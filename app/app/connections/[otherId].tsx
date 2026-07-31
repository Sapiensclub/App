import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { celestialInfo } from '@/lib/celestial';
import { loadConnectionWith, type Connection } from '@/lib/connections';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// A connection's fuller profile (PRD 5.4 — connection is what unlocks fuller
// visibility). Messaging (Inbox) and "Ask for help" arrive in the next chunks.
export default function ConnectionProfile() {
  const { colors } = useTheme();
  const { otherId } = useLocalSearchParams<{ otherId: string }>();
  const [c, setC] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!otherId) return;
    setC(await loadConnectionWith(otherId));
    setLoading(false);
  }, [otherId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!c || c.status !== 'active') {
    return (
      <Screen scroll={false}>
        <TopBar onBack={() => router.back()} />
        <View style={styles.center}>
          <Text variant="body" tone="secondary">
            This connection is no longer active.
          </Text>
        </View>
      </Screen>
    );
  }

  const stage = celestialInfo(c.other_stage);
  const since = c.active_at
    ? new Date(c.active_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '';

  return (
    <Screen>
      <TopBar onBack={() => router.back()} />
      <View style={styles.header}>
        {c.other_photo ? (
          <Image source={{ uri: c.other_photo }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="person" size={40} color={colors.accent} />
          </View>
        )}
        <Text variant="title" center style={{ marginTop: spacing.md }}>
          {c.other_name ?? 'A neighbour'}
        </Text>
      </View>

      <Card style={styles.card}>
        <Row icon={stage.icon} label="Celestial stage" value={stage.label} />
        <Divider />
        <Row
          icon="star"
          label="Trust"
          value={c.other_trust != null ? `${c.other_trust.toFixed(1)}★` : 'New'}
        />
        {since ? (
          <>
            <Divider />
            <Row icon="people-outline" label="Connected since" value={since} />
          </>
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button
          label="Message"
          left={<Ionicons name="chatbubble-ellipses" size={18} color={colors.onAccent} />}
          onPress={() =>
            Alert.alert('Inbox coming next', 'Messaging your connections arrives in the next build step.')
          }
        />
        <Text variant="small" tone="faint" center>
          The Inbox and directed requests (&ldquo;Ask {c.other_name ?? 'them'} for help&rdquo;) arrive soon.
        </Text>
      </View>
    </Screen>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.topBar}>
      <Ionicons name="arrow-back" size={26} color={colors.textPrimary} onPress={onBack} />
      <Text variant="heading" weight="bold" style={styles.topTitle}>
        Connection
      </Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.rowLine}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" weight="semibold">
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.surfaceEdge }]} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  topTitle: { flex: 1, textAlign: 'center' },
  header: { alignItems: 'center', paddingBottom: spacing.lg },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  card: { paddingVertical: spacing.sm },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { height: 1 },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
