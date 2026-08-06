import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { timeAgo } from '@/lib/help/timeAgo';
import {
  consentMoment,
  loadFeed,
  loadPendingMoments,
  removeMoment,
  setAppreciated,
  type FeedMoment,
  type PendingMoment,
} from '@/lib/moments';
import { useRealtime } from '@/lib/realtime';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The community Moments feed (PRD Bucket 8) — finite, calm, no counts, no
// tap-to-profile. It celebrates the good happening nearby, then it ends.
export default function Moments() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id;
  const [feed, setFeed] = useState<FeedMoment[]>([]);
  const [pending, setPending] = useState<PendingMoment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFeed(await loadFeed());
    setPending(await loadPendingMoments());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRealtime(myId ? `moments-${myId}` : null, [{ table: 'moments' }], load);

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      await consentMoment(id);
      await load();
    } catch {
      Alert.alert('Could not approve', 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDeclinePending(id: string) {
    setBusyId(id);
    try {
      await removeMoment(id);
      await load();
    } catch {
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  function onRemoveMine(id: string) {
    Alert.alert('Remove this moment?', 'It will disappear from everyone’s feed.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeMoment(id);
          await load();
        },
      },
    ]);
  }

  async function onAppreciate(m: FeedMoment) {
    if (!myId) return;
    const next = !m.i_appreciated;
    setFeed((f) => f.map((x) => (x.id === m.id ? { ...x, i_appreciated: next } : x)));
    try {
      await setAppreciated(m.id, myId, next);
    } catch {
      setFeed((f) => f.map((x) => (x.id === m.id ? { ...x, i_appreciated: !next } : x)));
    }
  }

  const empty = feed.length === 0 && pending.length === 0;

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text variant="title">Moments</Text>
      </View>

      {empty ? (
        <EmptyState
          icon="sparkles-outline"
          title="No moments near you yet"
          body="When people help each other nearby, the good shows up here — then you can put your phone down."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {/* Selfies waiting for my approval (double opt-in). */}
          {pending.map((p) => (
            <Card key={p.id} style={styles.pendingCard}>
              <Text variant="body" weight="bold">
                {p.from_name ?? 'A neighbour'} wants to share this moment with you
              </Text>
              {p.photo_url ? (
                <Image source={{ uri: p.photo_url }} style={styles.pendingPhoto} contentFit="cover" />
              ) : null}
              {p.caption ? (
                <Text variant="small" tone="secondary">
                  “{p.caption}”
                </Text>
              ) : null}
              <Text variant="small" tone="faint">
                It appears in Moments only if you approve. Either of you can remove it later.
              </Text>
              <View style={styles.pendingActions}>
                <Button label="Approve" onPress={() => onApprove(p.id)} busy={busyId === p.id} />
                <Button
                  label="No thanks"
                  variant="secondary"
                  onPress={() => onDeclinePending(p.id)}
                  disabled={busyId === p.id}
                />
              </View>
            </Card>
          ))}

          {feed.map((m) => (
            <MomentTile
              key={m.id}
              m={m}
              onAppreciate={() => onAppreciate(m)}
              onRemove={m.mine ? () => onRemoveMine(m.id) : undefined}
            />
          ))}

          {feed.length > 0 ? (
            <Text variant="small" tone="faint" center style={styles.bottom}>
              That&apos;s all for now — you&apos;re all caught up.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function MomentTile({
  m,
  onAppreciate,
  onRemove,
}: {
  m: FeedMoment;
  onAppreciate: () => void;
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  const names = (m.participant_names ?? []).filter(Boolean);

  let icon: keyof typeof Ionicons.glyphMap = 'sparkles';
  let title = '';
  if (m.type === 'help') {
    icon = 'heart';
    title = `A ${m.caption ?? 'help'} happened nearby`;
  } else if (m.type === 'milestone') {
    const stage = celestialInfo(m.caption ?? 'new_moon');
    icon = stage.icon;
    title = `${names[0] ?? 'A neighbour'} reached ${stage.label}`;
  } else {
    icon = 'people';
    title = names.length >= 2 ? `${names[0]} & ${names[1]}` : (names[0] ?? 'A shared moment');
  }

  return (
    <Card style={styles.tile}>
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={icon} size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="bold">
            {title}
          </Text>
          <Text variant="small" tone="faint">
            {m.area ? `${m.area} · ` : ''}
            {timeAgo(m.created_at)}
          </Text>
        </View>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove moment">
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {m.type === 'selfie' && m.photo_url ? (
        <Image source={{ uri: m.photo_url }} style={styles.photo} contentFit="cover" />
      ) : null}
      {m.type === 'selfie' && m.caption ? (
        <Text variant="small" tone="secondary">
          “{m.caption}”
        </Text>
      ) : null}

      <Pressable onPress={onAppreciate} style={styles.heartRow} hitSlop={6}>
        <Ionicons
          name={m.i_appreciated ? 'heart' : 'heart-outline'}
          size={22}
          color={m.i_appreciated ? colors.danger : colors.textFaint}
        />
        <Text variant="small" tone={m.i_appreciated ? 'primary' : 'faint'}>
          {m.i_appreciated ? 'You appreciated this' : 'Appreciate'}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  pendingCard: { gap: spacing.md },
  pendingPhoto: { width: '100%', aspectRatio: 1, borderRadius: radii.lg },
  pendingActions: { flexDirection: 'row', gap: spacing.md },
  tile: { gap: spacing.md },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tileIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radii.lg },
  heartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bottom: { paddingTop: spacing.sm },
});
