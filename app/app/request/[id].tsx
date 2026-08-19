import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { celestialInfo } from '@/lib/celestial';
import {
  confirmHelper,
  groupEnd,
  loadMatchesForRequest,
  loadMatchForRequest,
  retryRequest,
  seekerConfirmDone,
  vetoHelper,
  type Candidate,
  type MatchDetails,
} from '@/lib/help/matching';
import { distanceLabel, walkingEtaMinutes } from '@/lib/location/locationProvider';
import { useRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type RequestRow = {
  id: string;
  status: 'open' | 'matched' | 'active' | 'completed' | 'cancelled' | 'expired';
  timing: 'now' | 'scheduled';
  urgency: string;
  description: string | null;
  approx_area: string | null;
  expires_at: string | null;
  category_id: string;
  interaction_type: 'one_to_one' | 'group' | 'either';
  participant_cap: number | null;
  is_directed: boolean;
  directed_to: string | null;
  opened_at: string | null;
};

export default function RequestWaiting() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [participants, setParticipants] = useState<MatchDetails[]>([]);
  const [directedName, setDirectedName] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const candidate = candidates[0] ?? null; // earliest raised (one-to-one veto)

  const load = useCallback(async () => {
    if (!id) return;
    const { data: reqRow } = await supabase
      .from('requests')
      .select(
        'id, status, timing, urgency, description, approx_area, expires_at, category_id, interaction_type, participant_cap, is_directed, directed_to, opened_at',
      )
      .eq('id', id)
      .single();
    if (reqRow) {
      setRequest(reqRow as RequestRow);
      if (!categoryLabel) {
        const { data: cat } = await supabase
          .from('categories')
          .select('label')
          .eq('id', reqRow.category_id)
          .single();
        if (cat) setCategoryLabel(cat.label);
      }
      // The directed person's first name for the waiting copy (they're a
      // connection, so my_connections exposes their name).
      if (reqRow.directed_to && !directedName) {
        const { data: conn } = await supabase
          .from('my_connections')
          .select('other_name')
          .eq('other_id', reqRow.directed_to)
          .maybeSingle();
        if (conn?.other_name) setDirectedName(conn.other_name as string);
      }
    }

    setMatch(await loadMatchForRequest(id));
    setParticipants(await loadMatchesForRequest(id));

    const { data: cands } = await supabase
      .from('request_candidates')
      .select('*')
      .eq('request_id', id)
      .order('raised_at');
    setCandidates((cands ?? []) as Candidate[]);
  }, [id, categoryLabel, directedName]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    id ? `request-${id}` : null,
    [
      { table: 'requests', filter: `id=eq.${id}` },
      { table: 'request_responses', filter: `request_id=eq.${id}` },
      { table: 'matches', filter: `request_id=eq.${id}` },
    ],
    load,
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // While a helper is en route, refresh every 15s so the ETA stays current
  // (helper location isn't a realtime source).
  useEffect(() => {
    const active = match && match.status !== 'completed' && match.status !== 'cancelled';
    if (!active) return;
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
  }, [match?.status, load]);

  async function onConfirm() {
    if (!candidate || !id) return;
    setBusy(true);
    try {
      await confirmHelper(id, candidate.helper_id);
      await load();
    } catch (e) {
      Alert.alert('Could not confirm', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onDecline() {
    if (!candidate || !id) return;
    setBusy(true);
    try {
      await vetoHelper(id, candidate.helper_id);
      await load();
    } catch {
      Alert.alert('Could not decline', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDone() {
    if (!match) return;
    setBusy(true);
    try {
      await seekerConfirmDone(match.id);
      await load();
    } catch (e) {
      Alert.alert('Could not confirm', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onAddToGroup(helperId: string) {
    if (!id) return;
    setBusy(true);
    try {
      await confirmHelper(id, helperId);
      await load();
    } catch (e) {
      Alert.alert('Could not add', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onEndGroup() {
    if (!id) return;
    setBusy(true);
    try {
      await groupEnd(id);
      await load();
    } catch {
      Alert.alert('Could not end', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onRetry() {
    if (!id) return;
    setBusy(true);
    try {
      await retryRequest(id);
      await load();
    } catch (e) {
      Alert.alert('Could not retry', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!request) return;
    Alert.alert('Cancel this request?', 'Helpers will no longer be notified.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', request.id);
          setBusy(false);
          if (error) Alert.alert('Could not cancel', 'Please try again.');
          else router.replace('/(main)');
        },
      },
    ]);
  }

  if (!request) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const expiresAt = request.expires_at ? new Date(request.expires_at).getTime() : null;
  const expiredLocally = expiresAt !== null && now > expiresAt && request.status === 'open';
  const isCompleted = !!match && match.status === 'completed';
  const isMatched = !!match && match.status !== 'cancelled' && match.status !== 'completed';
  const status = isCompleted
    ? 'completed'
    : isMatched
      ? 'matched'
      : expiredLocally
        ? 'expired'
        : request.status;

  // Directed request (PRD 5.5): waiting on the named person, or opened to all.
  const askName = directedName ?? 'your connection';
  const directedWaiting = request.is_directed && !request.opened_at && status === 'open';
  const directedOpened = request.is_directed && !!request.opened_at && status === 'open';

  // ── Group coordination (multi-accept, PRD 4.7) ────────────────────────────
  if (request.interaction_type === 'group' && status !== 'expired' && status !== 'cancelled') {
    const joined = participants.filter((p) => p.status !== 'cancelled');
    const cap = request.participant_cap ?? Math.max(joined.length, 1);
    const canAddMore = joined.length < cap && request.status === 'open';

    if (request.status === 'completed') {
      return (
        <Screen scroll={false}>
          <View style={styles.center}>
            <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            </View>
            <Text variant="title" center celebrate>
              Your {categoryLabel} group met!
            </Text>
            <Text variant="body" tone="secondary" center style={styles.copy}>
              {joined.length} {joined.length === 1 ? 'neighbour' : 'neighbours'} joined you.
              That&apos;s the whole idea.
            </Text>
          </View>
          <View style={styles.footer}>
            <Button label="Back to home" onPress={() => router.replace('/(main)')} />
          </View>
        </Screen>
      );
    }

    return (
      <Screen>
        <View style={styles.groupHeader}>
          <Text variant="title" center>
            Your {categoryLabel} group
          </Text>
          <Text variant="body" tone="secondary" center>
            {joined.length} of {cap} joined
          </Text>
        </View>

        {joined.length > 0 ? (
          <Card style={styles.listCard}>
            {joined.map((p) => (
              <View key={p.id} style={styles.personRow}>
                <PersonAvatar photo={p.other_photo} />
                <Text variant="body" weight="semibold" style={{ flex: 1 }}>
                  {p.other_name ?? 'A neighbour'}
                </Text>
                <Text variant="small" tone="secondary">
                  joined
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Text variant="body" tone="secondary" center style={styles.copy}>
            Finding nearby people who want to join…
          </Text>
        )}

        {canAddMore && candidate ? (
          <View style={styles.groupSection}>
            <Text variant="label" weight="semibold" tone="secondary">
              People who can join
            </Text>
            {candidates.map((c) => (
              <View key={c.helper_id} style={styles.personRow}>
                <PersonAvatar photo={c.display_photo_url} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" weight="semibold">
                    {c.display_name ?? 'A verified neighbour'}
                  </Text>
                  {c.approx_distance_m != null ? (
                    <Text variant="small" tone="secondary">
                      About {distanceLabel(c.approx_distance_m)} away
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => onAddToGroup(c.helper_id)}
                  disabled={busy}
                  style={[styles.addPill, { backgroundColor: colors.accent }]}
                >
                  <Text variant="label" weight="bold" tone="onAccent">
                    Add
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          {joined.length > 0 ? (
            <>
              <Button
                label="Group chat"
                left={<Ionicons name="chatbubbles" size={18} color={colors.onAccent} />}
                onPress={() => router.push({ pathname: '/chat/[requestId]', params: { requestId: id! } })}
              />
              <Button label="End activity" variant="secondary" onPress={onEndGroup} busy={busy} />
            </>
          ) : null}
          <Button label="Cancel request" variant="ghost" onPress={cancel} disabled={busy} />
        </View>
      </Screen>
    );
  }

  // ── Completed ──────────────────────────────────────────────────────────────
  if (status === 'completed' && match) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          </View>
          <Text variant="title" center celebrate>
            {match.other_name ?? 'A neighbour'} helped you
          </Text>
          <Text variant="body" tone="secondary" center style={styles.copy}>
            That&apos;s the whole idea. Leave a rating to help build trust.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button
            label={`Rate ${match.other_name ?? 'your helper'}`}
            left={<Ionicons name="star" size={18} color={colors.onAccent} />}
            onPress={() => router.replace({ pathname: '/rate/[matchId]', params: { matchId: match.id } })}
          />
          <Button
            label="Share a moment"
            variant="secondary"
            left={<Ionicons name="camera" size={18} color={colors.accent} />}
            onPress={() => router.push({ pathname: '/moment/new', params: { requestId: id! } })}
          />
          <Button label="Not now" variant="ghost" onPress={() => router.replace('/(main)')} />
        </View>
      </Screen>
    );
  }

  // ── Matched: the helper is coming / here ──────────────────────────────────
  if (status === 'matched' && match) {
    const stage = celestialInfo(match.other_stage);
    const awaitingConfirm = !!match.helper_done_at;
    const headline = awaitingConfirm
      ? `Did ${match.other_name ?? 'your helper'} help you?`
      : match.status === 'arrived'
        ? `${match.other_name ?? 'Your helper'} has arrived`
        : match.status === 'on_the_way'
          ? `${match.other_name ?? 'Your helper'} is on the way`
          : `${match.other_name ?? 'Your helper'} is coming`;

    const dist = match.helper_distance_m;
    const etaLine =
      !awaitingConfirm && match.status === 'on_the_way' && dist != null
        ? `About ${distanceLabel(dist)} away · ~${walkingEtaMinutes(dist)} min`
        : null;

    return (
      <Screen>
        <View style={styles.matchedHeader}>
          {match.other_photo ? (
            <Image source={{ uri: match.other_photo }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="person" size={36} color={colors.accent} />
            </View>
          )}
          <Text variant="title" center style={{ marginTop: spacing.md }}>
            {headline}
          </Text>
          <View style={styles.stageRow}>
            <Ionicons name={stage.icon} size={16} color={colors.textSecondary} />
            <Text variant="small" tone="secondary">
              {stage.label}
              {match.other_trust != null ? ` · ${match.other_trust.toFixed(1)}★` : ''}
            </Text>
          </View>
          {etaLine ? (
            <Text variant="body" weight="semibold" tone="accent" style={{ marginTop: spacing.sm }}>
              {etaLine}
            </Text>
          ) : null}
        </View>

        <Card style={styles.meetCard}>
          <Text variant="small" tone="secondary">
            Meetup code
          </Text>
          <Text variant="display" celebrate style={styles.code}>
            {match.meetup_code}
          </Text>
          <Text variant="small" tone="faint">
            Ask for this code when they arrive, to confirm it&apos;s the right person.
          </Text>
        </Card>

        <View style={styles.footer}>
          {awaitingConfirm ? (
            <Button label="Yes, they helped me" onPress={onConfirmDone} busy={busy} />
          ) : null}
          <Button
            label={`Message ${match.other_name ?? 'helper'}`}
            variant={awaitingConfirm ? 'secondary' : 'primary'}
            left={
              <Ionicons
                name="chatbubble-ellipses"
                size={18}
                color={awaitingConfirm ? colors.accent : colors.onAccent}
              />
            }
            onPress={() => router.push({ pathname: '/chat/[requestId]', params: { requestId: id! } })}
          />
          <Button label="Back to home" variant="ghost" onPress={() => router.replace('/(main)')} />
        </View>
      </Screen>
    );
  }

  // ── A hand is raised: confirm or decline (veto, not pick) ─────────────────
  if (status === 'open' && candidate) {
    const stage = celestialInfo(candidate.celestial_stage);
    const memberSince = new Date(candidate.member_since).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="title" center style={styles.raisedTitle}>
            Someone can help!
          </Text>
          <Card style={styles.candidateCard}>
            {candidate.display_photo_url ? (
              <Image source={{ uri: candidate.display_photo_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="person" size={36} color={colors.accent} />
              </View>
            )}
            <View style={styles.nameRow}>
              <Text variant="heading" weight="bold" center>
                {candidate.display_name ?? 'A verified neighbour'}
              </Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
            <View style={styles.stageRow}>
              <Ionicons name={stage.icon} size={16} color={colors.textSecondary} />
              <Text variant="small" tone="secondary">
                {stage.label}
                {candidate.trust_rating_avg != null ? ` · ${candidate.trust_rating_avg.toFixed(1)}★` : ' · new here'}
              </Text>
            </View>
            {candidate.approx_distance_m != null ? (
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                About {distanceLabel(candidate.approx_distance_m)} away
              </Text>
            ) : null}

            {candidate.bio ? (
              <Text variant="body" tone="secondary" center style={styles.candidateBio}>
                &ldquo;{candidate.bio}&rdquo;
              </Text>
            ) : null}

            <View style={[styles.factsRow, { borderTopColor: colors.surfaceEdge }]}>
              <View style={styles.fact}>
                <Text variant="heading" weight="extrabold" tone="accent" style={styles.factNum}>
                  {candidate.unique_helps}
                </Text>
                <Text variant="small" tone="secondary" center>
                  {candidate.unique_helps === 1 ? 'neighbour helped' : 'neighbours helped'}
                </Text>
              </View>
              <View style={[styles.factDivider, { backgroundColor: colors.surfaceEdge }]} />
              <View style={styles.fact}>
                <Text variant="heading" weight="extrabold" style={styles.factNum}>
                  {memberSince}
                </Text>
                <Text variant="small" tone="secondary" center>
                  member since
                </Text>
              </View>
            </View>
          </Card>
          <Text variant="small" tone="faint" center style={styles.privacyNote}>
            Confirm to share your exact location and open a chat. Decline to wait
            for someone else — they won&apos;t be told.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button label="Confirm" onPress={onConfirm} busy={busy} />
          <Button label="Decline" variant="secondary" onPress={onDecline} disabled={busy} />
        </View>
      </Screen>
    );
  }

  // ── Searching / expired / cancelled ───────────────────────────────────────
  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <View style={styles.center}>
          {directedWaiting ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="person" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                Waiting for {askName}…
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                We&apos;ve asked {askName} first. If they&apos;re not around in a
                few minutes, we&apos;ll quietly ask others nearby too.
              </Text>
            </>
          ) : directedOpened ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="radio-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                Asking others nearby too
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                {askName} hasn&apos;t answered yet, so we&apos;re also notifying
                nearby verified helpers. Whoever&apos;s free can raise a hand.
              </Text>
            </>
          ) : status === 'open' ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="radio-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                Finding someone nearby…
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                Nearby verified helpers are being notified, closest first. Hang
                tight — we&apos;ll tell you the moment someone raises a hand.
              </Text>
            </>
          ) : null}

          {status === 'expired' ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="moon-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                No one&apos;s available right now
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                That happens sometimes — it&apos;s early days in your area. You can
                try again, or widen what you asked for.
              </Text>
            </>
          ) : null}

          {status === 'cancelled' ? (
            <Text variant="title" center>
              Request cancelled
            </Text>
          ) : null}

          <Card style={styles.detailCard}>
            <DetailRow icon="pricetag-outline" text={categoryLabel || '…'} />
            {request.description ? <DetailRow icon="chatbox-ellipses-outline" text={request.description} /> : null}
            {request.approx_area ? <DetailRow icon="location-outline" text={`Near ${request.approx_area}`} /> : null}
          </Card>
        </View>

        <View style={styles.footer}>
          {status === 'open' ? (
            <Button label="Cancel request" variant="secondary" onPress={cancel} busy={busy} />
          ) : status === 'expired' ? (
            <>
              <Button label="Try again" onPress={onRetry} busy={busy} />
              <Button label="Cancel request" variant="secondary" onPress={cancel} busy={busy} />
            </>
          ) : (
            <Button label="Back to home" onPress={() => router.replace('/(main)')} />
          )}
        </View>
      </View>
    </Screen>
  );
}

function PersonAvatar({ photo }: { photo: string | null }) {
  const { colors } = useTheme();
  if (photo) {
    return <Image source={{ uri: photo }} style={styles.personAvatar} contentFit="cover" />;
  }
  return (
    <View style={[styles.personAvatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
      <Ionicons name="person" size={20} color={colors.accent} />
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
  body: { flex: 1 },
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
  detailCard: { alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { gap: spacing.md, paddingBottom: spacing.lg },
  raisedTitle: { paddingTop: spacing.xl },
  candidateCard: { alignItems: 'center', marginTop: spacing.xl },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  candidateBio: { marginTop: spacing.md, paddingHorizontal: spacing.md },
  factsRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  fact: { flex: 1, alignItems: 'center', gap: 2 },
  factNum: { fontVariant: ['tabular-nums'] },
  factDivider: { width: 1, height: 36 },
  privacyNote: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  matchedHeader: { alignItems: 'center', paddingTop: spacing.xxl },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  meetCard: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxl },
  code: { letterSpacing: 8, marginVertical: spacing.xs },
  note: { paddingTop: spacing.xl },
  groupHeader: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  listCard: { gap: spacing.md },
  groupSection: { gap: spacing.sm, marginTop: spacing.xl },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personAvatar: { width: 40, height: 40, borderRadius: 20 },
  addPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
