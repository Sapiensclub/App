import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import {
  helperArrived,
  helperMarkDone,
  helperOnMyWay,
  helperStartOnline,
  loadMatchForRequest,
  raiseHand,
  withdrawHand,
  type HelperPing,
  type MatchDetails,
} from '@/lib/help/matching';
import { distanceLabel, showLocation } from '@/lib/location/locationProvider';
import { useRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type State =
  | 'loading'
  | 'can_raise'
  | 'raised'
  | 'confirmed'
  | 'completed'
  | 'matched_other'
  | 'unavailable';

export default function HelperRequest() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const myId = session?.user.id;

  const [ping, setPing] = useState<HelperPing | null>(null);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!requestId || !myId) return;

    const m = await loadMatchForRequest(requestId);
    if (m && m.helper_id === myId && m.status === 'cancelled') {
      // The match I was in was ended (e.g. the seeker used the safety hatch).
      setState('unavailable');
      return;
    }
    if (m && m.helper_id === myId) {
      setMatch(m);
      setState(m.status === 'completed' ? 'completed' : 'confirmed');
      return;
    }
    if (m) {
      // A match exists but it isn't mine → someone else was confirmed.
      setState('matched_other');
      return;
    }

    const { data: pingRow } = await supabase
      .from('helper_pings')
      .select('*')
      .eq('request_id', requestId)
      .maybeSingle();
    const p = (pingRow as HelperPing) ?? null;
    setPing(p);

    const { data: resp } = await supabase
      .from('request_responses')
      .select('status')
      .eq('request_id', requestId)
      .eq('helper_id', myId)
      .maybeSingle();

    if (resp?.status === 'vetoed') {
      setState('matched_other');
    } else if (!p || p.request_status !== 'open') {
      setState('unavailable');
    } else if (resp?.status === 'raised') {
      setState('raised');
    } else {
      setState('can_raise');
    }
  }, [requestId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: my responses and matches change → reload.
  useRealtime(
    requestId && myId ? `helper-req-${requestId}` : null,
    [
      { table: 'request_responses', filter: `request_id=eq.${requestId}` },
      { table: 'matches', filter: `request_id=eq.${requestId}` },
    ],
    load,
  );

  async function onRaise() {
    setBusy(true);
    try {
      await raiseHand(requestId!);
      await load();
    } catch (e) {
      Alert.alert('Could not raise your hand', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    try {
      await withdrawHand(requestId!);
      router.back();
    } catch {
      Alert.alert('Could not withdraw', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function runStep(fn: (id: string) => Promise<void>) {
    if (!match) return;
    setBusy(true);
    try {
      await fn(match.id);
      await load();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  // ── Confirmed: I'm helping — location released + meetup code ───────────────
  if (state === 'confirmed' && match) {
    const stage = celestialInfo(match.other_stage);
    const isGroup = match.interaction_type === 'group';
    return (
      <Screen>
        <TopBar title={isGroup ? "You're in the group" : "You're helping"} onBack={() => router.replace('/(main)')} />
        <View style={styles.confirmHeader}>
          {match.other_photo ? (
            <Image source={{ uri: match.other_photo }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="person" size={36} color={colors.accent} />
            </View>
          )}
          <Text variant="title" center style={{ marginTop: spacing.md }}>
            {isGroup ? `${match.other_name ?? 'A neighbour'}'s group` : (match.other_name ?? 'Your neighbour')}
          </Text>
          <View style={styles.stageRow}>
            <Ionicons name={stage.icon} size={16} color={colors.textSecondary} />
            <Text variant="small" tone="secondary">
              {stage.label}
              {match.other_trust != null ? ` · ${match.other_trust.toFixed(1)}★` : ''}
            </Text>
          </View>
        </View>

        <Card style={styles.meetCard}>
          <Text variant="small" tone="secondary">
            {match.is_online ? 'Session code' : 'Meetup code'}
          </Text>
          <Text variant="display" celebrate style={styles.code}>
            {match.meetup_code}
          </Text>
          <Text variant="small" tone="faint">
            {match.is_online
              ? 'Read this out on your call, to confirm you found the right person.'
              : 'Share this only when you meet, to confirm you found the right person.'}
          </Text>
        </Card>

        <Card style={styles.detailCard}>
          <DetailRow icon="pricetag-outline" text={match.category_label} />
          {match.is_online ? <DetailRow icon="globe-outline" text="Online — coordinate the call in chat" /> : null}
          {match.description ? <DetailRow icon="chatbox-ellipses-outline" text={match.description} /> : null}
          {!match.is_online && match.approx_area ? <DetailRow icon="map-outline" text={match.approx_area} /> : null}
        </Card>

        <View style={styles.navWrap}>
          {/* Solo help has a status ladder; a group activity does not.
              Online skips travel: Start helping → Mark as done. */}
          {!isGroup && match.is_online && match.status === 'confirmed' ? (
            <Button label="Start helping" onPress={() => runStep(helperStartOnline)} busy={busy} />
          ) : null}
          {!isGroup && !match.is_online && match.status === 'confirmed' ? (
            <Button label="I'm on my way" onPress={() => runStep(helperOnMyWay)} busy={busy} />
          ) : null}
          {!isGroup && !match.is_online && match.status === 'on_the_way' ? (
            <Button label="I've arrived" onPress={() => runStep(helperArrived)} busy={busy} />
          ) : null}
          {!isGroup && match.status === 'arrived' && !match.helper_done_at ? (
            <Button label="Mark as done" onPress={() => runStep(helperMarkDone)} busy={busy} />
          ) : null}
          {!isGroup && match.helper_done_at ? (
            <View style={[styles.waitingBanner, { backgroundColor: colors.accentSoft }]}>
              <ActivityIndicator color={colors.accent} />
              <Text variant="body" weight="semibold" tone="accent" style={{ flex: 1 }}>
                Waiting for {match.other_name ?? 'them'} to confirm…
              </Text>
            </View>
          ) : null}

          <Button
            label={isGroup ? 'Group chat' : `Message ${match.other_name ?? 'them'}`}
            variant={isGroup ? 'primary' : 'secondary'}
            left={
              <Ionicons
                name={isGroup ? 'chatbubbles' : 'chatbubble-ellipses'}
                size={18}
                color={isGroup ? colors.onAccent : colors.accent}
              />
            }
            onPress={() => router.push({ pathname: '/chat/[requestId]', params: { requestId: requestId! } })}
          />
          {match.meetpoint_lat != null && match.meetpoint_lng != null && !match.helper_done_at ? (
            <Button
              label="Navigate to meeting point"
              variant={isGroup ? 'secondary' : 'ghost'}
              left={<Ionicons name="navigate" size={18} color={colors.accent} />}
              onPress={() =>
                showLocation({ lat: match.meetpoint_lat!, lng: match.meetpoint_lng! }, 'Meeting point')
              }
            />
          ) : null}
          {isGroup ? (
            <Text variant="small" tone="faint" center>
              The organizer ends the activity when it&apos;s done.
            </Text>
          ) : null}
        </View>
      </Screen>
    );
  }

  // ── Completed ──────────────────────────────────────────────────────────────
  if (state === 'completed' && match) {
    return (
      <Screen scroll={false}>
        <TopBar title="Help complete" onBack={() => router.replace('/(main)')} />
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          </View>
          <Text variant="title" center celebrate>
            You helped {match.other_name ?? 'a neighbour'}!
          </Text>
          <Text variant="body" tone="secondary" center style={styles.copy}>
            Thank you for showing up. This is what Sapiens is for.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button
            label={`Rate ${match.other_name ?? 'them'}`}
            left={<Ionicons name="star" size={18} color={colors.onAccent} />}
            onPress={() => router.replace({ pathname: '/rate/[matchId]', params: { matchId: match.id } })}
          />
          <Button
            label="Share a moment"
            variant="secondary"
            left={<Ionicons name="camera" size={18} color={colors.accent} />}
            onPress={() => router.push({ pathname: '/moment/new', params: { requestId: requestId! } })}
          />
          <Button label="Not now" variant="ghost" onPress={() => router.replace('/(main)')} />
        </View>
      </Screen>
    );
  }

  // ── Matched with someone else / vetoed ─────────────────────────────────────
  if (state === 'matched_other') {
    return (
      <Screen scroll={false}>
        <TopBar title="Request update" onBack={() => router.replace('/help')} />
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="people-outline" size={44} color={colors.accent} />
          </View>
          <Text variant="title" center>
            Matched with someone else
          </Text>
          <Text variant="body" tone="secondary" center style={styles.copy}>
            This one is taken care of. Thank you for being ready to help — there
            will be more.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button label="See who else needs help" onPress={() => router.replace('/help')} />
        </View>
      </Screen>
    );
  }

  // ── No longer available (expired / cancelled) ─────────────────────────────
  if (state === 'unavailable') {
    return (
      <Screen scroll={false}>
        <TopBar title="Request update" onBack={() => router.replace('/help')} />
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="moon-outline" size={44} color={colors.accent} />
          </View>
          <Text variant="title" center>
            No longer needed
          </Text>
          <Text variant="body" tone="secondary" center style={styles.copy}>
            This request has expired or been cancelled.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button label="Back to Help now" onPress={() => router.replace('/help')} />
        </View>
      </Screen>
    );
  }

  // ── Open: can raise a hand, or waiting after raising ──────────────────────
  const directed = !!ping?.directed_to_me;
  return (
    <Screen>
      <TopBar title={directed ? 'A personal ask' : ping?.category_label ?? 'Request'} onBack={() => router.back()} />

      {directed ? (
        <View style={styles.directedHeader}>
          {ping?.from_photo ? (
            <Image source={{ uri: ping.from_photo }} style={styles.directedAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.directedAvatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="person" size={28} color={colors.accent} />
            </View>
          )}
          <Text variant="heading" weight="bold" center style={{ marginTop: spacing.sm }}>
            {ping?.from_name ?? 'A connection'} is asking you
          </Text>
          <Text variant="small" tone="secondary" center>
            A personal request from someone you&apos;re connected with.
          </Text>
        </View>
      ) : null}

      <Card style={styles.detailCard}>
        <DetailRow icon="pricetag-outline" text={ping?.category_label ?? ''} />
        {ping?.is_online ? <DetailRow icon="globe-outline" text="Online — help over a call or chat" /> : null}
        {ping?.description ? <DetailRow icon="chatbox-ellipses-outline" text={ping.description} /> : null}
        {!ping?.is_online && ping?.approx_distance_m != null ? (
          <DetailRow icon="location-outline" text={`About ${distanceLabel(ping.approx_distance_m)} away`} />
        ) : null}
        {!ping?.is_online && ping?.approx_area ? (
          <DetailRow icon="map-outline" text={`Near ${ping.approx_area}`} />
        ) : null}
      </Card>

      <Text variant="small" tone="faint" center style={styles.privacyNote}>
        {directed
          ? `${ping?.from_name ?? 'They'} asked you directly. Raise your hand to help — you'll get their exact location once they confirm.`
          : ping?.is_online
            ? "You'll see their name only if they confirm you. You coordinate the call in chat — no locations involved."
            : "You'll see their name and exact location only if they confirm you."}
      </Text>

      {state === 'raised' ? (
        <View style={styles.footer}>
          <View style={[styles.waitingBanner, { backgroundColor: colors.accentSoft }]}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="body" weight="semibold" tone="accent" style={{ flex: 1 }}>
              Hand raised — waiting for them to confirm…
            </Text>
          </View>
          <Button label="Withdraw" variant="secondary" onPress={onWithdraw} busy={busy} />
        </View>
      ) : (
        <View style={styles.footer}>
          <Button
            label="I'll help"
            left={<Ionicons name="hand-left" size={18} color={colors.onAccent} />}
            onPress={onRaise}
            busy={busy}
          />
        </View>
      )}
    </Screen>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.topBar}>
      <IconButton name="arrow-back" label="Back" onPress={onBack} />
      <Text variant="heading" weight="bold" style={styles.topTitle}>
        {title}
      </Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text variant="body" tone="secondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  topTitle: { flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  copy: { maxWidth: 320 },
  bigIcon: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  directedHeader: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.lg },
  directedAvatar: { width: 72, height: 72, borderRadius: 36 },
  detailCard: { gap: spacing.sm, marginTop: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  privacyNote: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  footer: { gap: spacing.md, marginTop: spacing.xl },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  confirmHeader: { alignItems: 'center', paddingTop: spacing.md },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  meetCard: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
  code: { letterSpacing: 8, marginVertical: spacing.xs },
  navWrap: { marginTop: spacing.xl, gap: spacing.md },
  note: { paddingTop: spacing.xl },
});
