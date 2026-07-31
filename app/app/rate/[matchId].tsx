import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  connectDecline,
  connectOffer,
  loadConnectionWith,
  type Connection,
} from '@/lib/connections';
import { loadMatchById, type MatchDetails } from '@/lib/help/matching';
import {
  loadMyRating,
  loadRatingAboutMe,
  submitRating,
  type Rating,
} from '@/lib/ratings';
import { useRealtime } from '@/lib/realtime';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function RateScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { matchId } = useLocalSearchParams<{ matchId: string }>();

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [mine, setMine] = useState<Rating | null>(null);
  const [aboutMe, setAboutMe] = useState<Rating | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    if (!matchId || !myId) return;
    const [m, r1, r2] = await Promise.all([
      loadMatchById(matchId),
      loadMyRating(matchId, myId),
      loadRatingAboutMe(matchId, myId),
    ]);
    setMatch(m);
    setMine(r1);
    setAboutMe(r2);
    if (m) setConnection(await loadConnectionWith(m.other_id));
    setLoading(false);
  }, [matchId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  // The reveal (ratings) and the other person accepting (connections) both
  // flip server-side → reload.
  useRealtime(
    matchId && myId ? `rating-${matchId}` : null,
    [
      { table: 'ratings', filter: `match_id=eq.${matchId}` },
      { table: 'connections', filter: `user_a=eq.${myId}` },
      { table: 'connections', filter: `user_b=eq.${myId}` },
    ],
    load,
  );

  async function onConnect() {
    if (!matchId) return;
    setConnecting(true);
    try {
      await connectOffer(matchId);
      track('connect_offered');
      await load();
    } catch (e) {
      Alert.alert('Could not connect', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  async function onDeclineConnect() {
    if (!matchId) return;
    setConnecting(true);
    try {
      await connectDecline(matchId);
      await load();
    } catch {
      // silent
    } finally {
      setConnecting(false);
    }
  }

  async function onSubmit() {
    if (!match || !myId) return;
    if (stars < 1) {
      Alert.alert('Add a rating', 'Tap a star to rate from 1 to 5.');
      return;
    }
    setBusy(true);
    try {
      await submitRating(matchId!, myId, match.other_id, stars, note);
      track('rating_submitted', { stars });
      await load();
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !match) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const name = match.other_name ?? 'your neighbour';

  return (
    <Screen>
      <TopBar title="Rate your experience" onBack={() => router.replace('/(main)')} />

      <View style={styles.header}>
        {match.other_photo ? (
          <Image source={{ uri: match.other_photo }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="person" size={32} color={colors.accent} />
          </View>
        )}
        <Text variant="heading" weight="bold" center style={{ marginTop: spacing.md }}>
          {name}
        </Text>
      </View>

      {/* My rating — a form until I submit, then a summary. */}
      {mine ? (
        <Card style={styles.card}>
          <Text variant="small" tone="secondary">
            You rated {name}
          </Text>
          <StarRow value={mine.stars} readOnly />
          {mine.feedback_text ? (
            <Text variant="body" tone="secondary">
              &ldquo;{mine.feedback_text}&rdquo;
            </Text>
          ) : null}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text variant="body" weight="semibold">
            How was it?
          </Text>
          <StarRow value={stars} onChange={setStars} />
          <TextField
            placeholder="Add a note (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            editable={!busy}
            style={styles.noteInput}
          />
          <Button label="Submit rating" onPress={onSubmit} busy={busy} />
          <Text variant="small" tone="faint" center>
            Neither of you sees the other&apos;s rating until you&apos;ve both rated.
          </Text>
        </Card>
      )}

      {/* Their rating of me — only visible once revealed (both rated). */}
      {mine ? (
        aboutMe ? (
          <Card style={styles.card}>
            <Text variant="small" tone="secondary">
              {name} rated you
            </Text>
            <StarRow value={aboutMe.stars} readOnly />
            {aboutMe.feedback_text ? (
              <Text variant="body" tone="secondary">
                &ldquo;{aboutMe.feedback_text}&rdquo;
              </Text>
            ) : null}
          </Card>
        ) : (
          <View style={styles.waiting}>
            <Ionicons name="eye-off-outline" size={20} color={colors.textFaint} />
            <Text variant="small" tone="faint" style={{ flex: 1 }}>
              Waiting for {name} to rate too — then you&apos;ll both see each other&apos;s.
            </Text>
          </View>
        )
      ) : null}

      {/* The Connect offer (PRD 5.2) — only after BOTH rated, and only if both
          rated well (rating-gated suppression). */}
      {mine && aboutMe && mine.stars >= 3 && aboutMe.stars >= 3 ? (
        connection?.status === 'active' ? (
          <Card tone="night" style={styles.connectCard}>
            <Ionicons name="people" size={28} color={colors.gold} />
            <Text variant="heading" weight="bold" center style={{ color: colors.moonlightStrong }}>
              You&apos;re connected!
            </Text>
            <Text variant="small" tone="moonlight" center>
              {name} is now in your circle. You can message anytime from your Inbox.
            </Text>
          </Card>
        ) : connection?.i_accepted ? (
          <View style={styles.waiting}>
            <Ionicons name="hourglass-outline" size={20} color={colors.textFaint} />
            <Text variant="small" tone="faint" style={{ flex: 1 }}>
              Waiting for {name} to connect too.
            </Text>
          </View>
        ) : connection?.status === 'declined' ? null : (
          <Card style={styles.connectCard}>
            <Ionicons name="people-outline" size={28} color={colors.accent} />
            <Text variant="heading" weight="bold" center>
              Connect with {name}?
            </Text>
            <Text variant="small" tone="secondary" center>
              Connections can message anytime and ask each other for help directly.
              Only if you both choose to.
            </Text>
            <Button label="Connect" onPress={onConnect} busy={connecting} />
            <Button label="Not now" variant="ghost" onPress={onDeclineConnect} disabled={connecting} />
          </Card>
        )
      ) : null}

      <View style={styles.footer}>
        <Button label="Done" variant={mine ? 'primary' : 'ghost'} onPress={() => router.replace('/(main)')} />
      </View>
    </Screen>
  );
}

function StarRow({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange?.(n)}
          disabled={readOnly}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={readOnly ? 24 : 40}
            color={n <= value ? colors.gold : colors.textFaint}
          />
        </Pressable>
      ))}
    </View>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.topBar}>
      <Ionicons name="arrow-back" size={26} color={colors.textPrimary} onPress={onBack} />
      <Text variant="heading" weight="bold" style={styles.topTitle}>
        {title}
      </Text>
      <View style={{ width: 26 }} />
    </View>
  );
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
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  card: { gap: spacing.md, marginBottom: spacing.lg },
  connectCard: { gap: spacing.sm, alignItems: 'center', marginBottom: spacing.lg },
  starRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.sm },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  footer: { marginTop: spacing.sm, paddingBottom: spacing.lg },
});
